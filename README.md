# Aria2 Fusion

## 项目概述
Aria2 Fusion 是一款以浏览器扩展形式呈现的现代风格 Aria2 下载管理器，它为用户提供了便捷、高效的下载管理体验。通过简洁直观的界面，用户能够轻松管理 Aria2 下载任务，同时具备丰富的功能，如实时监控下载速度、添加和管理下载任务、设置下载参数等。

## 主要功能

### 1. 连接测试
- 支持连接测试功能，用户点击测试按钮即可检查与 Aria2 服务器的连接状态。
- 若连接成功，会显示 Aria2 的版本信息；若连接失败，会给出相应的错误提示。

### 2. 下载速度监控
- 利用图表实时展示下载速度的变化，用户可直观了解下载的实时状态。
- 速度图表采用蓝色主题，视觉效果清晰，支持鼠标悬停查看具体的下载速度。

### 3. 下载任务管理
- **添加任务**：点击添加任务按钮，打开模态框输入下载链接，还可设置下载优先级和连接数等高级选项。
- **暂停与继续**：可随时暂停或继续正在进行的下载任务。
- **删除任务**：支持删除下载中、等待中、已完成、暂停或出错的下载任务。
- **重试任务**：当下载任务出现错误时，可点击重试按钮重新开始下载。
- **打开文件夹**：对于已完成的下载任务，可直接点击按钮打开下载文件所在的文件夹。

### 4. 下载列表更新
- 智能更新下载列表，仅更新有变动的部分，提高性能和响应速度。
- 当下载任务的状态发生变化时，会高亮显示该任务，提醒用户注意。

### 5. 设置功能
- **保存设置**：用户可对下载参数等设置进行保存，以便下次使用。
- **重置设置**：支持将设置恢复到默认状态。
- **高级选项切换**：提供高级选项的切换功能，方便用户根据需求进行个性化设置。

### 6. 错误提示
- 当出现错误时，会在页面底部弹出错误提示框，显示错误信息，并在一定时间后自动消失。

## 项目结构
```plaintext
aria2-fusion/
├── background.js         # 后台服务脚本，监听浏览器下载请求、右键菜单点击事件、弹出窗口的消息。
├── popup.js              # 控制弹出窗口的逻辑。
├── manifest.json         # Chrome扩展的清单文件，定义了扩展的基本信息
├── LICENSE               # 项目的许可证文件，规定了项目代码的使用、修改和分发规则。
├── popup.html            # 弹出窗口的HTML文件
├── README.md             # 项目的说明文档，简要介绍了该项目是一个aria2下载管理器。
├── tailwind.min.css      # 压缩后的Tailwind CSS文件，用于为项目提供样式支持。
├── .git/                 # Git版本控制系统的文件夹，包含项目的版本控制信息。
├── js/                   # 存放JavaScript库文件的文件夹
│   ├── mustache.min.js   # Mustache模板引擎的压缩文件，用于在项目中处理模板渲染。
│   └── chart.umd.js      # Chart.js图表库的UMD版本文件，用于在项目中创建和展示图表。
├── icons/                # 存放项目图标文件的文件夹，包含不同尺寸的图标（如16x16、32x32等）。
└── svg/                  # 存放SVG图标文件的文件夹，可能用于页面中的图标展示。
```

## 安装与使用
1. **安装**：将项目文件打包成浏览器扩展并加载到浏览器中。
2. **使用**：点击浏览器工具栏中的扩展图标，打开弹出窗口，即可开始使用各种功能。

## 注意事项
- 请确保 Aria2 服务器已正确配置并运行，以便扩展能够正常连接和管理下载任务。
- 在使用高级选项时，请根据自己的网络环境和需求进行合理设置，避免影响下载性能。
