// Package rcon is a minimal client for the Source RCON protocol (Valve's
// binary TCP protocol — standardized and well-documented, not reverse
// engineered). Palworld and most Source-descended dedicated servers implement
// it on RCON_PORT. One connection per command: RCON usage here is an
// occasional admin action, not a hot path, so pooling isn't worth the
// complexity.
package rcon

import (
	"bufio"
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"time"
)

const (
	typeAuth          = 3
	typeAuthResponse  = 2
	typeExecCommand   = 2
	typeResponseValue = 0
)

var ErrAuthFailed = errors.New("rcon: authentication failed")

type Client struct {
	conn net.Conn
	r    *bufio.Reader
	id   int32
}

// Dial connects, authenticates, and returns a ready client. Caller must Close.
func Dial(ctx context.Context, addr, password string) (*Client, error) {
	d := net.Dialer{Timeout: 5 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, err
	}
	c := &Client{conn: conn, r: bufio.NewReader(conn)}
	if err := c.auth(password); err != nil {
		conn.Close()
		return nil, err
	}
	return c, nil
}

func (c *Client) Close() error { return c.conn.Close() }

func (c *Client) nextID() int32 {
	c.id++
	return c.id
}

func (c *Client) send(id, typ int32, body string) error {
	buf := &bytes.Buffer{}
	binary.Write(buf, binary.LittleEndian, id)
	binary.Write(buf, binary.LittleEndian, typ)
	buf.WriteString(body)
	buf.WriteByte(0) // body NUL terminator
	buf.WriteByte(0) // empty trailing-string terminator
	size := int32(buf.Len())
	if err := binary.Write(c.conn, binary.LittleEndian, size); err != nil {
		return err
	}
	_, err := c.conn.Write(buf.Bytes())
	return err
}

type packet struct {
	ID   int32
	Type int32
	Body string
}

func (c *Client) readPacket() (packet, error) {
	var size int32
	if err := binary.Read(c.r, binary.LittleEndian, &size); err != nil {
		return packet{}, err
	}
	if size < 10 || size > 1<<20 {
		return packet{}, fmt.Errorf("implausible packet size %d", size)
	}
	buf := make([]byte, size)
	if _, err := io.ReadFull(c.r, buf); err != nil {
		return packet{}, err
	}
	id := int32(binary.LittleEndian.Uint32(buf[0:4]))
	typ := int32(binary.LittleEndian.Uint32(buf[4:8]))
	body := buf[8 : len(buf)-2] // strip the two NUL terminators
	return packet{ID: id, Type: typ, Body: string(body)}, nil
}

func (c *Client) auth(password string) error {
	c.conn.SetDeadline(time.Now().Add(5 * time.Second))
	defer c.conn.SetDeadline(time.Time{})
	id := c.nextID()
	if err := c.send(id, typeAuth, password); err != nil {
		return err
	}
	// Some servers send an empty SERVERDATA_RESPONSE_VALUE ahead of the real
	// auth response — skip packets until the auth-response type shows up.
	for i := 0; i < 5; i++ {
		p, err := c.readPacket()
		if err != nil {
			return err
		}
		if p.Type == typeAuthResponse {
			if p.ID == -1 {
				return ErrAuthFailed
			}
			return nil
		}
	}
	return errors.New("rcon: no auth response")
}

// Exec sends a command and returns its text response.
func (c *Client) Exec(command string) (string, error) {
	c.conn.SetDeadline(time.Now().Add(8 * time.Second))
	defer c.conn.SetDeadline(time.Time{})
	id := c.nextID()
	if err := c.send(id, typeExecCommand, command); err != nil {
		return "", err
	}
	p, err := c.readPacket()
	if err != nil {
		return "", err
	}
	return p.Body, nil
}
