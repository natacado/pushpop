var _ = require("underscore");
var express = require("express");
var app = express.createServer();
var io = require("socket.io").listen(app);
var port = process.env.PORT || 5555;

if (process.env.REDISTOGO_URL) {
  var rtg = require("url").parse(process.env.REDISTOGO_URL);
  var redis = require("redis").createClient(rtg.port, rtg.hostname);
  redis.auth(rtg.auth.split(":")[1]);
} else {
  var redis = require("redis").createClient();
}

app.use(express.bodyParser());
app.use(express.static(__dirname + "/public"));
app.listen(port);

app.get("/", function(req, res) {
  res.sendfile(__dirname + "/index.html");
});

app.post("/push/:token", function(req, res) {
  var url = req.body.url;

  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (url) {
    push(req.params.token, url);
    res.send("kthxbai", 201);
  } else {
    res.send("url required", 422);
  }
});

io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  io.set("polling duration", 10);
  io.set("close timeout", 15);
});

io.configure("production", function() {
  io.set("log level", 2);
});

io.sockets.on("connection", function(socket) {
  socket.on("ohai", function(token) {
    socket.set("token", token);
    socket.join(token);
  });

  socket.on("pop", function() {
    socket.get("token", function(err, token) {
      pop(token);
    });
  });
});

function push(token, url) {
  redis.incr(namespaced("total"));

  if (io.sockets.clients(token).length) {
    io.sockets.in(token).emit("push", url);
  } else {
    redis.rpush(namespaced(token), url);
  }
}

function pop(token) {
  redis.lpop(namespaced(token), function(err, value) {
    if (value) {
      io.sockets.in(token).emit("push", value);
      pop(token);
    }
  });
}

function namespaced(key) {
  return "pushpop:" + key;
}
