# Scripting 脚本

从 Scriptable（DmYY 框架）移植到 [Scripting](https://scripting.fun) 的水气费余额小组件。

| 脚本 | 名称 | 数据源 | 图标 |
|---|---|---|---|
| `XingNengGas` | 兴能燃气 | `wx.shuangliu.qjcode.com` | 火焰 |
| `MijiaWater` | 米家山水务 | `m.cdmjwater.com` | 水滴 |

## 功能

- RSA-1024 + AES-128-ECB 加密链路，与官方小程序一致
- 余额 / 欠费 / 抄表读数，户名户号自动回填
- 小号、中号、大号桌面组件 + 锁屏配件
- **历史账单**：近 6 期用量与表底读数，带用量条形图和月均统计
- 余额胶囊进度条，绿→青→黄→橙→红五色阶
- 深色模式自适应
- 剪贴板一键解析抓包凭据
- 缓存间隔控制与离线回退

## 安装

在 Scripting 中打开对应脚本的 `script.json` 里的 `remoteResource.url` 地址导入，
或直接把 `.scripting` 文件下载到「文件」App 后在 Scripting 中导入。

## 目录结构

```
Scripting/
├── XingNengGas/
│   ├── XingNengGas.scripting    发布包（tar 归档，无外层目录）
│   ├── script.json              客户端描述（含 remoteResource）
│   ├── index.tsx                配置页
│   ├── widget.tsx               桌面组件
│   ├── api.ts                   加密请求链路
│   ├── crypto.ts                纯 JS AES / RSA / Base64
│   ├── store.ts                 设置与缓存
│   └── format.ts                展示工具与色阶
└── MijiaWater/                  同上
```

## 更新流程

1. 改客户端源码
2. 运行 `python3 pack.py` 重新生成发布包与 md5
3. 上传新的 `.scripting` 与 `script.json`
4. 客户端在 `autoUpdateInterval`（24 小时）后自动拉取

> 发布包内的 `script.json` 不含 `remoteResource`，避免远程包覆盖自己的更新源。

## 免责声明

仅用于查询自己的账户余额。登录凭据由使用者自行抓包获取，脚本不上传任何数据。
