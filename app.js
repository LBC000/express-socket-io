const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
const { celebrate, Joi, errors, Segments } = require("celebrate");

// const NeDB = require("nedb");

// 初始化变量
// const verifyAutUrl = "http://127.0.0.1:7001/api/socketIo/register/open";
const verifyAutUrl = "http://127.0.0.1:1337/api/custom-auth/justVerify";

/** 初始化开始 */
const app = express();
app.use(bodyParser.json());

// 会自动加入req.body属性，这个属性中就包含了post请求所传入的参数
app.use(express.json());

// 配置 cors 这个中间件
const cors = require("cors");
app.use(cors());

const server = require("http").Server();

const startFn = async () => {
  const PouchDB = require("pouchdb-node");

  // 注入插件
  PouchDB.plugin(require("pouchdb-find"));

  // 创建在根目录下database文件夹下名为my_database的数据库
  const pouchDB = new PouchDB("pouchdb/my_database");

  // 设置索引
  await setDatabaseIndexes(pouchDB);

  // pouchDB.getIndexes().then((result) => {
  //   console.log(JSON.stringify(result), "列出索引");
  // });

  /**
 * 
 * cors: {
    origin: ["http://127.0.0.1:5500", "http://127.0.0.1:5500"],
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
  await deleteAllDocuments(pouchDB);

  // 公共频道
  const auth_socket = io
    .of("/auth_socket")
    .use((socket, next) => {
      if (socket.handshake?.query?.token) {
        let token = socket.handshake?.query?.token;

        console.log(token, "token-验证-1");

        registerSocket({ token, socket, pouchDB, auth_socket, next });
      } else {
        console.log("没有token");
        next();
        // next(new Error("Authentication error"));
      }
    })
    .on("connection", (socket) => {
      console.log("auth_socket 链接了");

      const res = formatData({
        code: 209,
        msg: "connected - this is a test message",
      });
      socket.emit("auth_socket", res);

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
            if (res.docs[0]) {
              pouchDB.remove(res.docs[0]);
            }

            console.log(res, res.docs[0], "监听断开连接11");
          });

        console.log(reason, socket.id, "auth_socket 某个用户 断开链接了");
      });
    })
    .on("disconnect", (socket) => {
      console.log("auth_socket 整体关闭了 断开链接了");
    });

  // 推送消息
  app.post(
    `${prefix_api}/emit`,
    celebrate({
      [Segments.BODY]: Joi.object().keys({
        type: Joi.string().required(),
        data: Joi.object().required(),
        actionType: Joi.string().required(),

        userIds: Joi.array(),
        roomNameArr: Joi.array(),
      }),
    }),
    (req, res) => {
      const { type, userIds, data, actionType, roomNameArr } = req.body;
      console.log(type, userIds, data, req.body, "接收的参数");

      if (type == "broadcast") {
        // 广播所有链接的客户端
        const res_broadcast = formatData({
          data: {
            data: data,
            type: type,
            actionType: actionType,
          },
        });

        auth_socket.emit("receive", res_broadcast);
      } else if (type == "user") {
        // 单个发送消息
        for (let j = 0; j < userIds.length; j++) {
          let user_id_item = userIds[j];

          pouchDB
            .find({
              selector: {
                doc_name: "socket_table",
                user_id: `t-${user_id_item}`,
              },
            })
            .then((res) => {
              for (let i = 0; i < res.docs.length; i++) {
                const element = res.docs[i];

                if (element) {
                  const res_user = formatData({
                    data: {
                      data: data,
                      type: type,
                      actionType: actionType,
                      userId: element.user_id,
                      socketId: element.socket_id,
                    },
                  });

                  auth_socket.to(element.socket_id).emit("receive", res_user);
                }
              }
              console.log(res.docs, "对某个用户发信息 - 触发");
            });
        }
      } else if (type == "room") {
        // console.log(type, roomNameArr, "房间发送消息");

        const res_room = formatData({
          data: {
            data: data,
            type: type,
            actionType: actionType,
          },
        });

        auth_socket.to(roomNameArr).emit("receive", res_room);
      }

      res.send(formatData());
    }
  );

  // 把用户添加到房间
  app.post(`${prefix_api}/socketsJoinOrLeaveRoom`, (req, res) => {
    const { userIds = [], roomName, type } = req.body;

    let resData = {};
    if (userIds.length == 0) {
      resData = formatData({
        code: 400,
        msg: "userIds 不能为空",
      });

      return res.send(resData);
    }

    if (!roomName) {
      resData = formatData({
        code: 400,
        msg: "roomName 不能为空",
      });

      return res.send();
    }

    if (!type) {
      resData = formatData({
        code: 400,
        msg: "type 不能为空",
      });

      res.send(resData);
    }

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

    res.send(formatData());
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
        let data = formatData({
          data: { count: docData.docs.length },
        });

        res.send(data);
      });
  });

  app.use(errors());

  // socket.io 服务
  server.listen(port_socket_io, () => {
    console.log(`socketIo port ${port_socket_io}, http://127.0.0.1:9988/`);
  });

  // express 服务
  app.listen(port_express, () => {
    console.log(`express app listening, http://127.0.0.1:9989/`);
  });
};

startFn();

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

function formatData(opt = {}) {
  const { data = null, msg = "ok", code = 200 } = opt;

  const formattedData = {
    data: data,
    msg: msg,
    code: code,
  };
  return formattedData;
}

async function setDatabaseIndexes(pouchDB) {
  try {
    const result = await pouchDB.createIndex({
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
    });
    console.log(result, "索引");
    return result;
  } catch (err) {
    return err;
  }
}

async function deleteAllDocuments(pouchDB) {
  try {
    const resData = await pouchDB
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
        return res;
      });

    console.log("删除全部文档成功");
    return resData;
  } catch (err) {
    console.error("删除全部文档时出错：", err);
    throw err;
  }
}

function registerSocket({ token, socket, pouchDB, auth_socket, next }) {
  fetch(verifyAutUrl, {
    method: "post",

    // body: JSON.stringify({
    //   token: token,
    // }),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
    .then((res) => res.json()) // expecting a json response
    .then((json) => {
      console.log("json数据", json);

      let jsonData = json || {};

      if (!jsonData.hasOwnProperty("user_id")) {
        socket.emit("auth_socket", { msg: "Validation error" });
        next(new Error("Authentication error"));
        return console.log("返回格式错误-无user_id字段");
      }

      let user_id_res = `t-${json.user_id}`;

      if (user_id_res) {
        const doc = {
          doc_name: "socket_table",
          user_id: user_id_res,
          socket_id: socket.id,
        };

        console.log(doc, "保存用户id");
        // // 验证成功保存 socket_id
        pouchDB.bulkDocs([doc]);

        // 加入房间
        pouchDB
          .find({
            selector: {
              doc_name: "room_table",
              user_id: user_id_res,
            },
          })
          .then((res) => {
            let element = res.docs[0];
            if (element) {
              auth_socket.in(socket.id).socketsJoin(element.room_name);
            }

            console.log(res.docs, element, "加入房间");
          });

        // console.log([doc], "验证成功");
        console.log("验证成功");

        next();
      } else {
        console.log("验证请求返回错误");
      }
      console.log(json, "验证结果");
    })
    .catch((err) => {
      socket.emit("auth_socket", { msg: "Validation error" });
      next(new Error("Authentication error"));

      console.log(err, "验证错误");
    });
}

// 公共函数结束
