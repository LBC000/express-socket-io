# express-socket-io

## 介绍

这是一个基于socket.io的socket库，旨在将项目中用到的socket功能单独抽离出来。该库是一个独立的服务，通过HTTP进行交互。 使用该库可以轻松向客户端推送消息，例如网站的实时公告（广播）、实时通知（广播）、向一个或多个用户推送消息以及创建房间（群聊）等功能。此库提供简单易用的接口，可方便地进行定制和扩展。

## 安装

```
npm i
```

## 使用

1. 客户端连接时需携带token进行连接。

2. 使用方需提供一个验证接口，将token传递给该接口进行验证。验证接口需返回以下1个字段 { user_id: 2 };

3. 连接
   
   1. ```js
      const socket = io("http://localhost:9988/auth_socket", {
            query: {
              token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoyOCwiY3JlYXRlVGltZSI6IjIwMjMtMDktMDYgMTE6MDI6NTciLCJ1cGRhdGVUaW1lIjoiMjAyMy0wOS0wNiAxMTowMjo1NyIsImFjY291bnQiOiJjIiwicGhvbmUiOm51bGx9LCJpYXQiOjE2OTQ2NjMyODIsImV4cCI6MTY5NDc0OTY4Mn0.KRgAnl8v6Qj2Ofz8vO5YfWphj64cC_e_JBUXIqAm-v0",
            },
          });
      ```

4. 验证
   
   1. const verifyAutUrl = "http://127.0.0.1:1337/api/custom-auth/justVerify";
   
   2. 验证返回格式: { user_id: 2 }

5. 发送消息调用 http://127.0.0.1:9989/api/v1/emit 接口
   
   - type类型包括：user（推送给个人），broadcast（广播，所有人都能收到），room（房间）
     
     ```
     {
     "type": "room",
     "roomNameArr": ["测试群"],
     "userIds": ["textToken-1"],
     "actionType": "orderList",
     "data": {
     "test": "测试单个用户"
     }
     }
     ```

6. 获取在线人数
   
   1. http://127.0.0.1:9989/api/v1/getOnLineCount

## 使用pm2：

1. 全局安装插件：npm i pm2 -g
2. 启动项目：pm2 start 脚本 --name 自定义名称
3. 查看运行项目：pm2 ls
4. 重启项目：pm2 restart 自定义名称
5. 停止项目：pm2 stop 自定义名称
6. 删除项目：pm2 delete 自定义名称

## 启动

```
pm2 start app.js --name express-socket-io
```

## 加入房间

```
{
  "type": "join",
  "userIds": ["textToken-1", "textToken-2"],
  "roomName": "test_1"
}
```
