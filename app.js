const express = require("express");
// const NeDB = require("nedb");

/** 初始化开始 */
const app = express();

// 会自动加入req.body属性，这个属性中就包含了post请求所传入的参数
app.use(express.json());

// 配置 cors 这个中间件
const cors = require("cors");
app.use(cors());

const PouchDB = require("pouchdb-node");

// 注入插件
PouchDB.plugin(require("pouchdb-find"));

// 创建在根目录下database文件夹下名为my_database的数据库
const pouchDB = new PouchDB("pouchdb/my_database");

// 设置索引
pouchDB
  .createIndex({
    index: {
      fields: [
        // 文档名
        "doc_name",

        // socket_table
        "user_id",
        "socket_id",

        // room_table
        "room_name",
      ],
    },
  })
  .then((result) => {
    console.log(result, "索引");
  });

// pouchDB.getIndexes().then((result) => {
//   console.log(JSON.stringify(result), "列出索引");
// });

const server = require("http").Server();

/**
 * 
 * cors: {
    origin: ["http://localhost:5500", "http://127.0.0.1:5500"],
  },
  cors: true
 */
const io = require("socket.io")(server, {
  cors: true,
});

// 清除console
// console.log = function () {};

/** 初始化结束 */

/**配置开始 */
const port_express = 9989;
const port_socket_io = 9988;
const prefix_api = "/api/v1";
/**配置结束 */

// 重启时删除全部
pouchDB
  .find({
    selector: {
      doc_name: "socket_table",
    },
  })
  .then((res) => {
    for (let i = 0; i < res.docs.length; i++) {
      const element = res.docs[i];
      element._deleted = true;
    }

    pouchDB.bulkDocs(res.docs);

    // console.log(res, "查全部");
  })
  .catch((err) => {
    console.log(err, "查全部-err");
  });

// 需要验证的频道
const auth_socket = io
  .of("/auth_socket")
  .use((socket, next) => {
    if (socket.handshake?.query?.token) {
      let token = socket.handshake?.query?.token;

      console.log(token, "测试");

      // 模拟请求第三方验证 开始
      startCheck(token)
        .then((res) => {
          if (res.status == "success") {
            let doc = {
              doc_name: "socket_table",
              user_id: res.data.user_id,
              socket_id: socket.id,
            };

            // // 验证成功保存 socket_id
            pouchDB.bulkDocs([doc]);

            // 加入房间
            pouchDB
              .find({
                selector: {
                  doc_name: "room_table",
                  user_id: res.data.user_id,
                },
              })
              .then((res) => {
                let element = res.docs[0];
                if (element) {
                  auth_socket.in(socket.id).socketsJoin(element.room_name);
                }

                // console.log(res.docs, "加入房间");
              });

            // console.log([doc], "验证成功");
            console.log("验证成功");

            next();
          } else {
            return next(new Error("Authentication error"));
          }

          // console.log(res, "验证返回了");
        })
        .catch((err) => {
          console.log(err, "验证报错了");
          return next(new Error("Authentication error"));
        });
    } else {
      console.log("没有token");
      next(new Error("Authentication error"));
    }
  })
  .on("connection", (socket) => {
    console.log("auth_socket 链接了");

    socket.emit("auth_socket", "链接了- 给客户端发数据");

    // 监听断开连接
    socket.on("disconnect", (reason) => {
      pouchDB
        .find({
          selector: {
            doc_name: "socket_table",
            socket_id: socket.id,
          },
        })
        .then((res) => {
          pouchDB.remove(res.docs[0]);
          console.log(res, res.docs[0], "监听断开连接11");
        });

      console.log(reason, socket.id, "auth_socket 某个用户 断开链接了");
    });
  })
  .on("disconnect", (socket) => {
    console.log("auth_socket 整体关闭了 断开链接了");
  });

// 推送消息
app.post(`${prefix_api}/emit`, (req, res) => {
  const { type, userIds, data, actionType, roomNameArr } = req.body;
  console.log(type, userIds, data, "接收的参数");

  if (type == "broadcast") {
    // 广播所有链接的客户端
    auth_socket.emit("auth_socket", {
      data: data,
      type: type,
      actionType: actionType,
    });
  } else if (type == "user") {
    // 单个发送消息
    for (let j = 0; j < userIds.length; j++) {
      let user_id_item = userIds[j];

      pouchDB
        .find({
          selector: {
            doc_name: "socket_table",
            user_id: user_id_item,
          },
        })
        .then((res) => {
          for (let i = 0; i < res.docs.length; i++) {
            const element = res.docs[i];

            if (element) {
              auth_socket.to(element.socket_id).emit("auth_socket", {
                data: data,
                type: type,
                actionType: actionType,
                userId: element.user_id,
                socketId: element.socket_id,
              });
            }
          }
          console.log(res.docs, "对某个用户发信息 - 触发");
        });
    }
  } else if (type == "room") {
    // console.log(type, roomNameArr, "房间发送消息");

    auth_socket.to(roomNameArr).emit("auth_socket", {
      data: data,
      type: type,
      actionType: actionType,
    });
  }

  res.send({
    code: 200,
    msg: "ok",
  });
});

// 把用户添加到房间
app.post(`${prefix_api}/socketsJoinOrLeaveRoom`, (req, res) => {
  const { userIds = [], roomName, type } = req.body;

  if (userIds.length == 0)
    return res.send({
      code: 400,
      msg: "userIds 不能为空",
    });

  if (!roomName)
    return res.send({
      code: 400,
      msg: "roomName 不能为空",
    });

  if (!type)
    return res.send({
      code: 400,
      msg: "type 不能为空",
    });

  // 加入房间
  for (let j = 0; j < userIds.length; j++) {
    let user_id = userIds[j];

    // 保存用户和房间的关系
    pouchDB
      .find({
        selector: {
          doc_name: "room_table",
          user_id: user_id,
          room_name: roomName,
        },
      })
      .then((res) => {
        const element = res.docs[0];

        if (element && type == "leave") {
          return pouchDB.remove(element);
        }

        if (element) {
          // 更新

          console.log(element, "更新1");
          pouchDB.put(element);
        } else {
          // 新建保存
          let doc = {
            doc_name: "room_table",
            user_id: user_id,
            room_name: roomName,
          };

          console.log(doc, "新建了");
          pouchDB.bulkDocs([doc]);
        }
      });

    pouchDB
      .find({
        selector: {
          doc_name: "socket_table",
          user_id: user_id,
        },
      })
      .then((res) => {
        for (let i = 0; i < res.docs.length; i++) {
          const element = res.docs[i];

          console.log(element, "房间1");
          if (element) {
            console.log(element, roomName, type, "房间2");

            if (type == "join") {
              auth_socket.in(element.socket_id).socketsJoin(roomName);
            } else if (type == "leave") {
              // 退出
              auth_socket.in(element.socket_id).socketsLeave(roomName);
            }
          }
        }

        console.log(res.docs, "对某个用户发信息 - 触发");
      });
  }

  res.send({
    code: 200,
    msg: "ok",
  });
});

// 获取在线人数
app.get(`${prefix_api}/getOnLineCount`, (req, res) => {
  pouchDB
    .find({
      selector: {
        doc_name: "socket_table",
      },
    })
    .then((docData) => {
      res.send({
        data: { count: docData.docs.length },
      });
    });
});

// socket.io 服务
server.listen(port_socket_io, () => {
  console.log(`socketIo port ${port_socket_io}, http://localhost:9988/`);
});

// express 服务
app.listen(port_express, () => {
  console.log(`express app listening, http://localhost:9989/`);
});

// 公共函数开始
// 模拟请求第三方验证
function startCheck(token) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      // 验证成功
      resolve({
        status: "success",
        data: {
          user_id: token,
        },
      });

      // 验证失败
      // reject({
      //   status: "fail",
      //   data: {
      //     user_id: token,
      //   },
      // });
    }, 500);
  });
}

// 公共函数结束
