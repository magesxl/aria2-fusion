// 存储Aria2配置
let aria2Config = {
  host: 'localhost',
  port: 6800,
  secure: false,
  secret: '',
  path: '/jsonrpc',
  enabled: true,
  fileSize: 10 // 最小文件大小（MB），超过此大小的下载将被Aria2接管
};

// 加载保存的配置
chrome.storage.sync.get({
  aria2host: 'localhost',
  aria2port: 6800,
  aria2secure: false,
  aria2secret: '',
  aria2path: '/jsonrpc',
  aria2enabled: true,
  aria2fileSize: 10
}, (config) => {
  aria2Config.host = config.aria2host;
  aria2Config.port = config.aria2port;
  aria2Config.secure = config.aria2secure;
  aria2Config.secret = config.aria2secret;
  aria2Config.path = config.aria2path;
  aria2Config.enabled = config.aria2enabled;
  aria2Config.fileSize = config.aria2fileSize;
});

// 监听配置变更
chrome.storage.onChanged.addListener((changes) => {
  if (changes.aria2host) aria2Config.host = changes.aria2host.newValue;
  if (changes.aria2port) aria2Config.port = changes.aria2port.newValue;
  if (changes.aria2secure) aria2Config.secure = changes.aria2secure.newValue;
  if (changes.aria2secret) aria2Config.secret = changes.aria2secret.newValue;
  if (changes.aria2path) aria2Config.path = changes.aria2path.newValue;
  if (changes.aria2enabled) aria2Config.enabled = changes.aria2enabled.newValue;
  if (changes.aria2fileSize) aria2Config.fileSize = changes.aria2fileSize.newValue;
});

//监听浏览器的下载请求

// 监听下载创建事件
chrome.downloads.onCreated.addListener((downloadItem) => {
  console.log("onCreated监听事件参数：", downloadItem);

  if (aria2Config.enabled && downloadItem.fileSize > aria2Config.fileSize * 1024 * 1024) {
    // 根据下载项的URL获取Cookie
    const url = new URL(downloadItem.url);
    chrome.cookies.getAll({ url: url.origin }, (cookies) => {
      console.log(`Origin Cookies for ${url.origin}:`, cookies);
      // 将cookie整合成一个字符串，使用'; '作为分隔符  有的网站下载需要cookies  要不会下载报错
      const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join(';');
      console.log(`Str Cookies for ${url.origin}:`, cookieString);
      // 在这里处理你的逻辑，比如取消下载并调用Aria2
      chrome.downloads.cancel(downloadItem.id, () => {
        if (chrome.runtime.lastError) {
          chrome.downloads.removeFile(downloadItem.id);
          console.warn("cancel error:", chrome.runtime.lastError);
          return; // 取消失败，不继续处理
        }

        // 获取文件名, 优先从最终文件名获取，如果没有则从URL获取
        chrome.downloads.search({ id: downloadItem.id }, (results) => {
          if (results && results.length > 0) {
            const item = results[0];
            console.log("search结果：", item);
            // 从下载列表移除（erase）
            chrome.downloads.erase({ id: downloadItem.id }, () => {
              if (chrome.runtime.lastError) {
                console.error("从下载列表移除失败:", chrome.runtime.lastError);
                return;
              }

              console.log("从下载列表移除成功：", downloadItem.id);
              getFileName(item).then(fileName => {
                sendToAria2(downloadItem.finalUrl, fileName, cookieString);
              })
            });

          } else {
            console.warn("未找到对应的下载项：", downloadItem.id);
          }
        });
      });
    });
  }
});

async function getFileName(item) {
  // 如果已有文件名，从路径中提取
  if (item.filename) {
    return item.filename.split(/[\\/]/).pop();
  }

  try {
    // 尝试从URL中获取文件名
    if (item.finalUrl) {
      // 如果URL解析无法获取文件名，尝试发送请求获取content-disposition
      try {
        const response = await fetch(item.finalUrl, {
          method: 'HEAD',
          credentials: 'include' // 包含cookies以处理需要认证的资源
        });
        if (!response.ok) {  // 检查响应状态
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log("response:", response);
        // 从响应头中获取content-disposition
        const contentDisposition = response.headers.get('content-disposition');
        console.log("contentDisposition:", contentDisposition);
        if (contentDisposition) {
          // 2.2 从 Content-Disposition 解析文件名 (更简洁的正则表达式)
          const filenameMatch = contentDisposition.match(
            /filename\*?=(?:UTF-8''|'|")?([^;'"\n]*)/i
          );

          if (filenameMatch && filenameMatch[1]) {
            let filename = filenameMatch[1];
            // 统一处理 URL 编码和引号
            try {
              filename = decodeURIComponent(filename).replace(/['"]/g, '');
              return filename;
            } catch (decodeError) {
              // 解码失败，回退到未解码的名称 (但仍去除引号)
              return filename.replace(/['"]/g, '');
            }
          }
        }
      } catch (fetchError) {
        console.warn('请求获取content-disposition时出错:', fetchError);
      }
    }
  } catch (error) {
    console.warn('从URL提取文件名时出错:', error);
  }

  // 回退选项
  return item.title || '未知文件';
}
// 监听浏览器右键菜单
chrome.runtime.onInstalled.addListener(() => {
  console.log("插件已安装，正在创建右键菜单...");
  chrome.contextMenus.create({
    id: "aria2-download-link",
    title: "使用Aria2下载链接",
    contexts: ["link"]
  });

  chrome.contextMenus.create({
    id: "aria2-download-image",
    title: "使用Aria2下载图片",
    contexts: ["image"]
  });

  chrome.contextMenus.create({
    id: "aria2-download-video",
    title: "使用Aria2下载视频",
    contexts: ["video"]
  });

  chrome.contextMenus.create({
    id: "aria2-download-audio",
    title: "使用Aria2下载音频",
    contexts: ["audio"]
  });

});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  let url = '';
  console.log("右键菜单点击事件参数：", info);
  switch (info.menuItemId) {
    case "aria2-download-link":
      url = info.linkUrl;
      break;
    case "aria2-download-image":
      url = info.srcUrl;
      break;
    case "aria2-download-video":
      url = info.srcUrl;
      break;
    case "aria2-download-audio":
      url = info.srcUrl;
      break;
  }

  // 添加判断获取真实下载url
  if (url) {
    getRealDownloadUrl(url, tab.id).then(realUrl => {
      // 使用真实URL执行下载操作
      sendToAria2(realUrl);
    }).catch(error => {
      console.error("获取真实下载URL失败:", error);
      // 失败时使用原始URL
      sendToAria2(url);
    });
  }
});



// 发送URL到Aria2
function sendToAria2(url, filename = '', cookie = '', inputOptions = {}) {
  const rpcUrl = `${aria2Config.secure ? 'https' : 'http'}://${aria2Config.host}:${aria2Config.port}${aria2Config.path}`;

  // 创建下载选项
  const options = {
    out: filename,
    header: [`Referer: ${new URL(url).origin}`, `Cookie: ${cookie}`], // 添加引用页信息，解决一些网站的防盗链问题
    ...inputOptions
  };

  // 准备参数
  let params = [[url], options];
  if (aria2Config.secret) {
    params.unshift(`token:${aria2Config.secret}`);
  }
  console.log('Sending to Aria2:', params);
  fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'aria2.addUri',
      params: params
    })
  })
    .then(response => response.json())
    .then(data => {
      console.log('Aria2 response:', data);
      // 检查响应中是否包含错误
      if (data.error) {
        console.error('Aria2 returned an error:', data.error);
        // 通知用户发生错误
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '添加下载失败',
          message: `错误: ${data.error.message || '未知错误'}`
        });
        return;
      }
      // 通知用户下载已添加
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '下载已添加',
        message: `${filename || url} 已发送到Aria2下载器`
      });
    })
    .catch(error => {
      console.error('Error sending to Aria2:', error);

      // 通知用户发生错误
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '发送失败',
        message: '无法连接到Aria2，请检查设置'
      });
    });
}

// 监听来自弹出窗口的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("收到来自弹出窗口的消息:", message);
  if (message.action === 'addDownload') {
    const originUrl = message.url;
    const url = new URL(message.url);
    chrome.cookies.getAll({ url: url.origin }, (cookies) => {
      if (chrome.runtime.lastError) {
        console.error("Error fetching cookies:", chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError });
        return;
      }
      console.log(`Origin Cookies for ${url.origin}:`, cookies);
      // 将cookie整合成一个字符串，使用'; '作为分隔符  有的网站下载需要cookies  要不会下载报错
      const cookieString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join(';');
      console.log(`Str Cookies for ${url.origin}:`, cookieString);
      const options = {
        priority: message.options.priority,
        'max-connection-per-server': message.options.maxConnectionPerServer,
      }
      getFileName({ finalUrl: originUrl }).then(fileName => {
        console.log("文件名：", fileName);
        sendToAria2(originUrl, fileName, cookieString, options);
        sendResponse({ success: true });
      });
    });
  } else if (message.action === 'getConfig') {
    sendResponse(aria2Config);
  } else if (message.action === 'saveConfig') {
    // 保存新的配置
    chrome.storage.sync.set({
      aria2host: message.config.host,
      aria2port: message.config.port,
      aria2secure: message.config.secure,
      aria2secret: message.config.secret,
      aria2path: message.config.path,
      aria2enabled: message.config.enabled,
      aria2fileSize: message.config.fileSize
    }, () => {
      // 更新当前的配置
      Object.assign(aria2Config, message.config);
      sendResponse({ success: true });
    });
    return true; // 表示异步发送响应
  } else if (message.action === 'interceptedLink') {
    console.log("收到拦截的下载链接:", message.url);

    // 如果Aria2下载未启用，使用浏览器默认下载
    if (!aria2Config.enabled) {
      chrome.downloads.download({
        url: message.url,
        filename: message.filename,
        saveAs: false
      });
      sendResponse({ success: true });
      return true;
    }

    // 处理文件扩展名检查
    const extension = message.filename.split('.').pop().toLowerCase();
    const exceptList = aria2Config.exceptExtensions ?
      aria2Config.exceptExtensions.split(',').map(ext => ext.trim().toLowerCase()) :
      [];

    // 检查是否应该排除这个文件类型
    if (exceptList.includes(extension)) {
      console.log(`使用浏览器下载 (排除的扩展名: ${extension}):`, message.filename);
      chrome.downloads.download({
        url: message.url,
        filename: message.filename,
        saveAs: false
      });
      sendResponse({ success: true });
      return true;
    }

    // 发送到Aria2下载
    const options = {
      out: message.filename,
      header: [
        `Referer: ${message.referrer}`,
        `User-Agent: ${navigator.userAgent}`
      ]
    };

    const rpcUrl = `${aria2Config.secure ? 'https' : 'http'}://${aria2Config.host}:${aria2Config.port}${aria2Config.path}`;

    // 准备参数
    let params = [[message.url], options];
    if (aria2Config.secret) {
      params.unshift(`token:${aria2Config.secret}`);
    }

    fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now().toString(),
        method: 'aria2.addUri',
        params: params
      })
    })
      .then(response => response.json())
      .then(data => {
        console.log('Aria2响应:', data);

        if (data.error) {
          console.error('Aria2错误:', data.error);
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '下载失败',
            message: `${message.filename} 添加失败: ${data.error.message}`
          });
          sendResponse({ success: false, error: data.error });
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: '下载已添加',
            message: `${message.filename} 已发送到Aria2下载器`
          });
          sendResponse({ success: true, gid: data.result });
        }
      })
      .catch(error => {
        console.error('发送到Aria2失败:', error);
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '连接失败',
          message: '无法连接到Aria2服务器，请检查设置'
        });
        sendResponse({ success: false, error: error.message });
      });
  }
  return true; // 表示会异步发送响应
});



