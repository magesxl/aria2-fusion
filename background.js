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
                sendToAria2(downloadItem.finalUrl, fileName, cookieString, downloadItem.referrer);
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
    getRealDownloadUrl(url).then(realUrl => {
      console.log("获取到的真实下载URL:", realUrl);
      // 使用真实URL执行下载操作
      sendToAria2(realUrl);
    }).catch(error => {
      console.error("获取真实下载URL失败:", error);
      // 失败时使用原始URL
      sendToAria2(url);
    });
  }
});

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
        sendToAria2(originUrl, fileName, cookieString, '', options);
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
  }
  return true; // 表示会异步发送响应
});

// 获取真实下载URL的函数
async function getRealDownloadUrl(url) {
  // 4. JavaScript 生成的链接 或 重定向链接：尝试使用 fetch() 获取 Content-Disposition
  //    如果 Content-Disposition 存在且包含 filename，则很可能是下载链接
  try {
    const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    console.log("response:", response);
    const contentDisposition = response.headers.get('Content-Disposition');
    if (contentDisposition && contentDisposition.includes('attachment')) {
      const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
      if (filenameMatch && filenameMatch[1]) {
        let filename = filenameMatch[1].replace(/['"]/g, '');
        return new URL(filename, response.url).href;
      }
    }
    // 检查 Content-Type (BT 种子)
    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.includes('application/x-bittorrent')) {
      return response.url; //返回重定向后的URL
    }

    return response.url; // 返回最终的 URL (可能是重定向后的)
  } catch (error) {
    console.error("Error fetching URL:", error);
    throw error; // Re-throw to be caught by the caller
  }
}


async function getFileName(item) {
  // 如果已有文件名，从路径中提取
  if (item.filename) {
    return extractFilenameFromPath(item.filename);
  }
  // 尝试从URL中获取文件名
  if (item.finalUrl) {
    // 如果URL路径中没有文件名，尝试从响应头中获取
    try {
      const filenameFromHeaders = await getFilenameFromHeaders(item.finalUrl);
      if (filenameFromHeaders) {
        return filenameFromHeaders;
      }
    } catch (error) {
      console.warn('从URL提取文件名时出错:', error);
    }
    // 从URL路径中提取文件名
    const filenameFromUrl = extractFilenameFromUrl(item.finalUrl);
    if (filenameFromUrl) {
      return filenameFromUrl;
    }
  }
  // 回退选项
  return item.title || '未知文件';
}

/**
 * 从路径中提取文件名
 * @param {string} path - 文件路径
 * @returns {string} - 返回文件名
 */
function extractFilenameFromPath(path) {
  return path.split(/[\\/]/).pop();
}


/**
 * 从URL路径中提取文件名
 * @param {string} url - 文件URL
 * @returns {string} - 返回文件名
 */
function extractFilenameFromUrl(url) {
  try {
    const newUrl = new URL(url);
    console.log("newUrl:", newUrl);
    // 检查是否有 response-content-disposition 参数
    const disposition = newUrl.searchParams.get('response-content-disposition');
    if (disposition) {
      // 从 response-content-disposition 中提取文件名
      parseFilenameFromContentDisposition(disposition);
    }
    // 如果没有 response-content-disposition，从 pathname 中提取文件名
    return newUrl.pathname.split('/').pop();
  } catch (error) {
    console.warn('从URL路径提取文件名时出错:', error);
    return null;
  }
}

/**
 * 从HTTP响应头中提取文件名
 * @param {string} url - 文件URL
 * @returns {Promise<string>} - 返回文件名
 */
async function getFilenameFromHeaders(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      credentials: 'include' // 包含cookies以处理需要认证的资源
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // 从响应头中获取content-disposition
    console.log('判断名称响应头信息:');
    response.headers.forEach((value, name) => {
      console.log(`${name}: ${value}`);
    });
    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition) {
      return parseFilenameFromContentDisposition(contentDisposition);
    }
  } catch (error) {
    console.warn('请求获取content-disposition时出错:', error);
    throw error;
  }
  return null;
}
/**
 * 从Content-Disposition头中解析文件名
 * @param {string} contentDisposition - Content-Disposition头
 * @returns {string} - 返回文件名
 */
function parseFilenameFromContentDisposition(contentDisposition) {
  const filenameMatch = contentDisposition.match(
    /filename\*?=(?:UTF-8''|'|")?([^;'"\n]*)/i
  );
  if (filenameMatch && filenameMatch[1]) {
    let filename = filenameMatch[1];
    try {
      filename = decodeURIComponent(filename).replace(/['"]/g, '');
    } catch (decodeError) {
      // 解码失败，回退到未解码的名称 (但仍去除引号)
      filename = filename.replace(/['"]/g, '');
    }
    return filename;
  }
  return null;
}



// 发送URL到Aria2
function sendToAria2(url, filename = '', cookie = '', referrer = '', inputOptions = {}) {
  const rpcUrl = `${aria2Config.secure ? 'https' : 'http'}://${aria2Config.host}:${aria2Config.port}${aria2Config.path}`;
  referrer = referrer || new URL(url).origin;
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36'
  // 创建下载选项
  const options = {
    out: filename,
    header: [`Referer: ${referrer}`, `Cookie: ${cookie}`, `User-Agent: ${userAgent}`], // 添加引用页信息，解决一些网站的防盗链问题
    ...inputOptions
  };
  // 如果不支持分片，则设置 split 为 1；否则，不设置 split 选项
  isRangeRequestSupported(url).then(supported => {
    if (supported) {
    } else {
      options.split = '1';
    }
  });
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
        showNotification('添加下载失败', `错误: ${data.error.message || '未知错误'}`);
        return;
      }
      // 通知用户下载已添加
      showNotification('下载已添加', `${filename || url} 已发送到Aria2下载器`);
    })
    .catch(error => {
      console.error('Error sending to Aria2:', error);
      // 通知用户发生错误
      showNotification('发送失败', '无法连接到Aria2，请检查设置');
    });
}

/**
 * 判断链接是否支持分片下载
 * @param {string} url 文件链接
 * @returns {Promise<boolean>} 是否支持分片下载
 */
async function isRangeRequestSupported(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'Range': 'bytes=0-0' // 请求一个字节
      }
    });
    console.log('判断名称响应头信息:', response);
    console.log('支持Range响应头信息:');
    response.headers.forEach((value, name) => {
      console.log(`${name}: ${value}`);
    });
    if (response.status === 206) {
      // 1. 优先检查 Accept-Ranges
      const acceptRanges = response.headers.get('Accept-Ranges');
      if (acceptRanges === 'bytes') {
        return true; // 有 Accept-Ranges: bytes，明确支持
      }

      // 2. 如果没有 Accept-Ranges，再检查 Content-Range
      const contentRange = response.headers.get('Content-Range');
      if (contentRange && contentRange.startsWith('bytes')) {
        return true; // 没有 Accept-Ranges，但有有效的 Content-Range，也认为支持
      }

      return false; // 206 状态码，但既没有 Accept-Ranges: bytes，也没有有效的 Content-Range
    } else if (response.status === 200) {
      if (response.headers.get('Content-Range')) {
        return true;
      }
      return false;
    }
    else {
      return false; // 其他状态码，不支持
    }
  } catch (error) {
    console.error("Error checking range request support:", error);
    // 发生错误，可能是不支持，也可能是网络问题，根据需要处理
    return false;
  }
}


/**
 * 显示通知并在 3 秒后自动关闭
 * @param {string} title - 通知标题
 * @param {string} message - 通知内容
 */
function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    requireInteraction: false // 允许通知自动关闭
  }, (notificationId) => {
    // 3 秒后关闭通知
    setTimeout(() => {
      chrome.notifications.clear(notificationId);
    }, 3000);
  });
}