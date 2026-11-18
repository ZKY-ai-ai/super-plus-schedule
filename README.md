# 课序PLUS

以 [课序 ClassFlow](https://github.com/lcymxm/classflow) 为底座开发的大学生课表项目。

- 上游版本：v1.11.1，提交 `30c466a`，许可证 MIT
- 源码位置：[third_party/classflow-full/](third_party/classflow-full/)
- 技术栈：React 19 + TypeScript + Vite 8 + Capacitor，pnpm 管理

## 开发

```bash
cd third_party/classflow-full
pnpm install
pnpm dev        # http://127.0.0.1:5173
pnpm test
pnpm build      # 产物在 dist/
```

## 目录

```
third_party/classflow-full/   课序 ClassFlow 完整源码（开发主工程）
桌面版/                        课序PLUS Windows 启动器（Edge 应用模式打开线上课表）
docs/                         调研与清单文档
安装包/                        参考项目安装包校验信息
启动课序PLUS.cmd               本地开发一键启动脚本
```

上游为 MIT 许可，许可证与版权声明保留在 [third_party/classflow-full/LICENSE](third_party/classflow-full/LICENSE)。
