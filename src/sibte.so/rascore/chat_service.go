package rascore

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "strconv"
    "strings"
    "sync"

    "github.com/gorilla/websocket"
    "github.com/julienschmidt/httprouter"

    "sibte.so/rasconfig"
    "sibte.so/rascore/utils"
)

type ChatService struct {
    sync.Mutex
    groupInfo    GroupInfoManager
    chatStore    *ChatLogStore
    nickRegistry *NickRegistry
    upgrader     *websocket.Upgrader
    httpMux      *http.ServeMux
    blackList    map[string]interface{}
}

func NewChatService(appConfig rasconfig.ApplicationConfig) *ChatService {
    initChatHandlerTypes()
    e := rasutils.CreatePathIfMissing(rasconfig.CurrentAppConfig.DBPath)
    if e != nil {
        log.Panic(e)
    }

    store, e := NewChatLogStore(rasconfig.CurrentAppConfig.DBPath+"/chats.db")
    allowedOrigins := appConfig.AllowedOrigins

    if e != nil {
        log.Panic(e)
    }

    wsUpgrader := &websocket.Upgrader{
        ReadBufferSize:  1024,
        WriteBufferSize: 1024,
    }

    if len(allowedOrigins) > 0 {
        wsUpgrader.CheckOrigin = func(r *http.Request) bool {
            origin := r.Header.Get("Origin")
            if origin == "" || allowedOrigins == nil || len(allowedOrigins) == 0 {
                return true
            }

            for _, item := range allowedOrigins {
                if strings.Compare(item, origin) == 0 {
                    return true
                }
            }

            log.Println("Denying connection due to missing origin " + origin)
            return false
        }
    }

    ret := &ChatService{
        groupInfo:    NewInMemoryGroupInfo(),
        nickRegistry: NewNickRegistry(),
        chatStore:    store,
        upgrader:     wsUpgrader,
        blackList:    make(map[string]interface{}),
    }

    return ret
}

func (c *ChatService) WithRESTRoutes(prefix string) http.Handler {
    mux := http.NewServeMux()
    mux.Handle(prefix+"/api/", c.httpRoutes(prefix+"/api", httprouter.New()))
    c.httpMux = mux
    return c
}

func (c *ChatService) ServeHTTP(w http.ResponseWriter, req *http.Request) {
    if strings.HasPrefix(req.URL.Path, "/chat/api") {
        c.httpMux.ServeHTTP(w, req)
        return
    }

    c.upgradeConnectionToWebSocket(w, req)
}

func (c *ChatService) httpRoutes(prefix string, router *httprouter.Router) http.Handler {
    router.GET(prefix+"/channel/:id/message", c.onGetChatHistory)
    router.GET(prefix+"/channel/:id/message/:msg_id", c.onGetChatMessage)
    router.GET(prefix+"/channel", c.onGetChannels)
    router.GET(prefix+"/channel/:id/info", c.onGetChannelInfo)
    router.GET(prefix+"/blacklist/:uid/:action", c.onBlackListUser)

    return router
}

func (c *ChatService) upgradeConnectionToWebSocket(w http.ResponseWriter, req *http.Request) bool {
    conn, err := c.upgrader.Upgrade(w, req, nil)
    if err == nil {
        transporter := NewWebsocketMessageTransport(conn)
        handler := NewChatHandler(c.nickRegistry, c.groupInfo, transporter, c.chatStore, req.RemoteAddr, c.blackList)
        go handler.Loop()
        return true
    }

    log.Println("Error upgrading connection...", err)
    return false
}

func (c *ChatService) onGetChatHistory(w http.ResponseWriter, req *http.Request, p httprouter.Params) {
    groupID := p.ByName("id")

    queryParams := req.URL.Query()
    var offset uint = 0
    var limit uint = 20
    startID := queryParams.Get("start_id")

    if o, err := strconv.ParseUint(queryParams.Get("offset"), 10, 32); err == nil {
        offset = uint(o)
    }

    if l, err := strconv.ParseUint(queryParams.Get("limit"), 10, 32); err == nil {
        limit = uint(l)
    }

    chatLog, err := c.chatStore.GetMessagesFor(groupID, startID, offset, limit)
    if err == nil {
        response := make(map[string]interface{})
        response["limit"] = limit
        response["offset"] = offset
        response["messages"] = chatLog
        response["start_id"] = startID
        response["id"] = groupID
        json.NewEncoder(w).Encode(response)
    } else {
        w.WriteHeader(http.StatusInternalServerError)
        json.NewEncoder(w).Encode(ErrorMessage{
            Error: err.Error(),
        })
    }
}

// TODO: this code should be moved in a separate handler
func (c *ChatService) onGetChatMessage(w http.ResponseWriter, req *http.Request, p httprouter.Params) {
}

// TODO: this code should be moved in a separate handler
func (c *ChatService) onGetChannels(w http.ResponseWriter, req *http.Request, _ httprouter.Params) {
}

// TODO: this code should be moved in a separate handler
func (c *ChatService) onGetChannelInfo(w http.ResponseWriter, req *http.Request, p httprouter.Params) {
    groupID := p.ByName("id")

    for key, val := range c.nickRegistry.GetMappingSnapshot() {
        fmt.Fprintf(w, "%v => %v \n", key, val)
    }

    for uid, info := range c.groupInfo.GetAllInfoObjects(groupID) {
        if inf, ok := info.(*userOutGoingInfo); ok {
            fmt.Fprintf(w, "IP %v => %v \n", uid, inf.ip)
        } else {
            fmt.Fprintf(w, "Invalid %v => %v \n", uid, info)
        }
    }
}

func (c *ChatService) onBlackListUser(w http.ResponseWriter, req *http.Request, p httprouter.Params) {
    userId := p.ByName("uid")
    action := p.ByName("action")
    if action == "off" {
        delete(c.blackList, userId)
    } else {
        c.blackList[userId] = struct{}{}
    }
}
