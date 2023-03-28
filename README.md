# express-socket-io

## 介绍
这是一个基于socket.io的socket库，旨在将项目中用到的socket功能单独抽离出来。该库是一个独立的服务，通过HTTP进行交互。 使用该库可以轻松向客户端推送消息，例如网站的实时公告（广播）、实时通知（广播）、向一个或多个用户推送消息以及创建房间（群聊）等功能。此库提供简单易用的接口，可方便地进行定制和扩展。

## 安装
```
npm i
```

## 使用
1. 客户端连接时需携带token进行连接。

2. 使用方需提供一个验证接口，将token传递给该接口进行验证。验证接口需返回以下两个字段： user_name：res.data.user_name user_id: res.data.user_id
推送数据

3. 调用 http://localhost:9989/api/v1/emit 接口
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

