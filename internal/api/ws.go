package api

import (
	"bufio"
	"net/http"

	"github.com/coder/websocket"
)

// logs upgrades to a WebSocket and streams the container's log lines live —
// this is the console you watch. Reads the follow stream line by line and
// pushes each line as a text frame until the socket or container closes.
func (a *api) logs(w http.ResponseWriter, r *http.Request) {
	sv, err := a.st.Get(r.PathValue("id"))
	if err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		// Local dev: the console is served from the same origin, but accept
		// broadly so opening the page from any localhost port just works.
		InsecureSkipVerify: true,
	})
	if err != nil {
		return
	}
	defer c.Close(websocket.StatusNormalClosure, "")

	ctx := r.Context()
	stream, err := a.dk.Logs(ctx, sv.ContainerID)
	if err != nil {
		_ = c.Write(ctx, websocket.MessageText, []byte("[paldeck] no logs — is the server started?"))
		return
	}
	defer stream.Close()

	sc := bufio.NewScanner(stream)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		if err := c.Write(ctx, websocket.MessageText, sc.Bytes()); err != nil {
			return // client went away
		}
	}
}
