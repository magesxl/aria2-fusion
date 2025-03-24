// 与Aria2的通信配置
const aria2Config = {
  host: 'localhost',
  port: 6800,
  secure: false,
  secret: '',
  path: '/jsonrpc',
  enabled: true,
  fileSize: 10
};

// 保存当前下载列表状态，并添加锁定标志
let currentDownloadItems = {};

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 创建模板
  createDownloadItemTemplate();

  // 初始化下载列表
  renderDownloads();

  // 加载设置
  loadSettings();

  // 设置事件监听器
  setupEventListeners();

  // 初始化与Aria2的连接
  initAria2Connection();

  // 定期刷新主页面
  const refreshInterval = 1000; // 2秒
  setInterval(refreshMainPage, refreshInterval);

  initHeartbeatChart();
  setupEventListeners();
  // 确保在窗口调整大小时Canvas保持正确高度
  window.addEventListener('resize', function () {
    const canvas = document.getElementById('downloadHeartbeat');
    canvas.style.height = '24px';
    if (heartbeatChart) {
      heartbeatChart.resize();
    }
  });
});



// 全局变量
let heartbeatChart; // 图表对象
let speedHistory = [0]; // 历史速度数据，初始化为一个点
let speedMonitorInterval; // 定时器ID
const MAX_DATA_POINTS = 30; // 数据点数量
let clickTooltip = null; // 点击提示元素

// 初始化下载速度图表
function initHeartbeatChart() {
  const canvas = document.getElementById('downloadHeartbeat');
  const ctx = canvas.getContext('2d');

  // 确保canvas高度与容器高度一致
  canvas.style.height = '24px';
  canvas.height = 24;

  // 创建渐变背景 - 使用蓝色主题，更醒目清晰
  const gradient = ctx.createLinearGradient(0, 0, 0, 24);
  gradient.addColorStop(0, 'rgba(59, 130, 246, 0.6)');   // 蓝色顶部
  gradient.addColorStop(0.6, 'rgba(59, 130, 246, 0.2)'); // 蓝色中部
  gradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');  // 蓝色底部

  // 初始数据配置 - 设置为单点模式
  const data = {
    labels: [''],
    datasets: [{
      data: [0], // 初始单点数据
      borderColor: '#3B82F6', // 蓝色线条
      borderWidth: 2, // 稍粗的线条更清晰
      backgroundColor: gradient,
      tension: 0.3, // 平滑程度
      fill: true,
      pointRadius: 4, // 初始点要清晰可见
      pointHoverRadius: 5,
      pointBackgroundColor: '#3B82F6',
      pointBorderColor: '#FFFFFF',
      pointBorderWidth: 1.5,
      cubicInterpolationMode: 'monotone',
      showLine: false, // 初始不显示线条，只显示点
    }]
  };

  // 图表配置
  const config = {
    type: 'line',
    data: data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 2,
          right: 0,
          bottom: 2,
          left: 0
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          enabled: false // 禁用内置tooltip，使用自定义tooltip
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          display: false,
          min: 0,
          max: 100, // 初始最大值
          grace: '10%'
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false,
      },
      animation: {
        duration: 400,
        easing: 'easeOutCubic'
      },
      elements: {
        line: {
          borderJoinStyle: 'round',
          borderCapStyle: 'round',
        },
        point: {
          hitRadius: 10,
          hoverRadius: 5
        }
      }
    }
  };

  // 创建图表
  heartbeatChart = new Chart(ctx, config);

  // 重新定位速度提示到右上角
  repositionSpeedTooltip();

  // 添加自定义CSS以确保画布和容器高度一致
  const style = document.createElement('style');
  style.textContent = `
    #downloadHeartbeat {
      height: 24px !important;
      max-height: 24px !important;
      cursor: pointer; /* 添加指针样式表示可点击 */
    }
    .download-stats {
      position: relative;
    }
    #speedTooltip {
      background-color: rgba(15, 23, 42, 0.95) !important;
      border: 1px solid rgba(59, 130, 246, 0.3) !important;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2) !important;
      font-size: 0.75rem !important;
      z-index: 50 !important;
    }
    #downloadSpeed {
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .click-tooltip {
      position: absolute;
      background-color: rgba(15, 23, 42, 0.95);
      color: white;
      border: 1px solid rgba(59, 130, 246, 0.5);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 600;
      pointer-events: none;
      white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
      z-index: 100;
      animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);

  // 添加点击事件监听器
  canvas.addEventListener('click', handleChartClick);

  // 启动定时获取下载速度
  startSpeedMonitoring();
}

// 将速度提示重新定位到右上角
function repositionSpeedTooltip() {
  const tooltip = document.getElementById('speedTooltip');
  if (tooltip) {
    // 移除原来的定位类
    tooltip.classList.remove('top-full', 'left-1/2', 'transform', '-translate-x-1/2', 'mt-1');

    // 添加右上角定位类
    tooltip.classList.add('top-0', 'right-0', 'transform', 'translate-y-[-120%]', 'mr-0');

    // 修改其他样式使其更合适右上角显示
    tooltip.style.borderRadius = '4px';
    tooltip.style.padding = '3px 6px';
    tooltip.style.minWidth = '80px';
    tooltip.style.textAlign = 'center';
  }
}

// 处理图表点击事件
function handleChartClick(event) {
  const canvas = event.target;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const canvasWidth = rect.width;

  // 根据点击位置计算数据索引
  const clickedIndex = Math.round((x / canvasWidth) * (speedHistory.length - 1));

  // 确保索引在有效范围内
  if (clickedIndex >= 0 && clickedIndex < speedHistory.length) {
    const clickedSpeed = speedHistory[clickedIndex];
    const formattedSpeed = formatBytes(clickedSpeed) + '/s';

    // 显示点击提示
    showClickTooltip(event.clientX, event.clientY, formattedSpeed, clickedSpeed > 0);

    // 高亮显示被点击的点
    highlightDataPoint(clickedIndex);
  }
}

// 显示点击提示
function showClickTooltip(x, y, text, isActive) {
  // 移除旧的提示（如果存在）
  if (clickTooltip) {
    document.body.removeChild(clickTooltip);
  }

  // 创建提示元素
  clickTooltip = document.createElement('div');
  clickTooltip.className = 'click-tooltip';
  clickTooltip.textContent = text;

  // 设置位置在鼠标右上方
  clickTooltip.style.left = (x + 10) + 'px';
  clickTooltip.style.top = (y - 30) + 'px';

  // 根据是否有下载设置颜色
  if (isActive) {
    clickTooltip.style.borderColor = 'rgba(59, 130, 246, 0.5)';
  } else {
    clickTooltip.style.borderColor = 'rgba(107, 114, 128, 0.5)';
    clickTooltip.style.color = 'rgba(255, 255, 255, 0.7)';
  }

  // 添加到文档
  document.body.appendChild(clickTooltip);

  // 2秒后自动移除提示
  setTimeout(() => {
    if (clickTooltip) {
      clickTooltip.style.opacity = '0';
      clickTooltip.style.transition = 'opacity 0.3s ease-out';

      setTimeout(() => {
        if (clickTooltip && clickTooltip.parentNode) {
          document.body.removeChild(clickTooltip);
          clickTooltip = null;
        }
      }, 300);
    }
  }, 2000);
}

// 高亮显示被点击的数据点
function highlightDataPoint(index) {
  // 创建临时点半径数组
  const pointRadiusArray = Array(speedHistory.length).fill(0);

  // 设置点击的点和最后一个点为可见
  pointRadiusArray[index] = 5; // 点击的点稍大
  if (index !== speedHistory.length - 1) {
    pointRadiusArray[speedHistory.length - 1] = 3; // 最后点保持可见
  }

  // 更新图表
  heartbeatChart.data.datasets[0].pointRadius = pointRadiusArray;

  // 设置点击点的特殊颜色
  const pointBackgroundColors = Array(speedHistory.length).fill('#3B82F6');
  pointBackgroundColors[index] = '#F59E0B'; // 黄色高亮点击的点
  heartbeatChart.data.datasets[0].pointBackgroundColor = pointBackgroundColors;

  heartbeatChart.update();

  // 1.5秒后恢复
  setTimeout(() => {
    const normalPointRadiusArray = Array(speedHistory.length).fill(0);
    normalPointRadiusArray[speedHistory.length - 1] = 3; // 恢复只显示最后一个点
    heartbeatChart.data.datasets[0].pointRadius = normalPointRadiusArray;
    heartbeatChart.data.datasets[0].pointBackgroundColor = '#3B82F6';
    heartbeatChart.update();
  }, 1500);
}

// 开始监控下载速度
function startSpeedMonitoring() {
  // 立即执行一次
  updateDownloadSpeed();

  // 每秒获取一次下载速度
  speedMonitorInterval = setInterval(updateDownloadSpeed, 1000);
}

// 更新下载速度
function updateDownloadSpeed() {
  // 构建aria2.getGlobalStats请求
  getGlobalStat()
    .then(task => {
      // 获取下载速度 (字节/秒)
      const downloadSpeed = parseInt(task.downloadSpeed);

      // 添加新数据
      speedHistory.push(downloadSpeed);

      // 保持固定数量的数据点
      if (speedHistory.length > MAX_DATA_POINTS) {
        speedHistory.shift();
      }

      // 更新图表显示
      updateHeartbeatChart(downloadSpeed);
    }).catch(error => {
      console.error('Error fetching aria2 stats:', error);

      // 错误时也添加数据点(0)以保持图表连续性
      if (speedHistory.length > 0) {
        speedHistory.push(0);
        if (speedHistory.length > MAX_DATA_POINTS) {
          speedHistory.shift();
        }
        updateHeartbeatChart(0, true);
      }
    });
}

// 更新图表函数
function updateHeartbeatChart(currentSpeed, isError = false) {
  // 检查是否应该切换到线图模式
  const shouldShowLine = speedHistory.length > 1;

  if (speedHistory.length > 0) {
    // 计算更贴近数据实际范围的Y轴
    const minSpeed = Math.min(...speedHistory);
    const maxSpeed = Math.max(...speedHistory) || 100; // 避免全0数据时没有高度
    const range = maxSpeed - minSpeed;

    // 设置Y轴范围
    heartbeatChart.options.scales.y = {
      display: false,
      min: Math.max(0, minSpeed - range * 0.1),
      max: maxSpeed + range * 0.2,
    };

    // 更新数据
    heartbeatChart.data.labels = Array(speedHistory.length).fill('');
    heartbeatChart.data.datasets[0].data = speedHistory;

    // 设置线条显示/隐藏状态
    heartbeatChart.data.datasets[0].showLine = shouldShowLine;

    // 根据状态设置颜色
    if (isError) {
      // 错误状态 - 使用红色
      heartbeatChart.data.datasets[0].borderColor = '#EF4444';
      heartbeatChart.data.datasets[0].pointBackgroundColor = '#EF4444';

      const ctx = document.getElementById('downloadHeartbeat').getContext('2d');
      const errorGradient = ctx.createLinearGradient(0, 0, 0, 24);
      errorGradient.addColorStop(0, 'rgba(239, 68, 68, 0.6)');
      errorGradient.addColorStop(0.6, 'rgba(239, 68, 68, 0.2)');
      errorGradient.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
      heartbeatChart.data.datasets[0].backgroundColor = errorGradient;
    } else if (currentSpeed === 0) {
      // 无下载状态 - 使用灰色
      heartbeatChart.data.datasets[0].borderColor = '#6B7280';
      heartbeatChart.data.datasets[0].pointBackgroundColor = '#6B7280';

      const ctx = document.getElementById('downloadHeartbeat').getContext('2d');
      const grayGradient = ctx.createLinearGradient(0, 0, 0, 24);
      grayGradient.addColorStop(0, 'rgba(107, 114, 128, 0.5)');
      grayGradient.addColorStop(0.6, 'rgba(107, 114, 128, 0.2)');
      grayGradient.addColorStop(1, 'rgba(107, 114, 128, 0.05)');
      heartbeatChart.data.datasets[0].backgroundColor = grayGradient;
    } else {
      // 正常下载状态 - 使用蓝色
      heartbeatChart.data.datasets[0].borderColor = '#3B82F6';
      heartbeatChart.data.datasets[0].pointBackgroundColor = '#3B82F6';

      const ctx = document.getElementById('downloadHeartbeat').getContext('2d');
      const blueGradient = ctx.createLinearGradient(0, 0, 0, 24);
      blueGradient.addColorStop(0, 'rgba(59, 130, 246, 0.6)');
      blueGradient.addColorStop(0.6, 'rgba(59, 130, 246, 0.2)');
      blueGradient.addColorStop(1, 'rgba(59, 130, 246, 0.05)');
      heartbeatChart.data.datasets[0].backgroundColor = blueGradient;
    }

    // 设置点的显示
    if (speedHistory.length === 1) {
      // 只有一个点时，显示较大的点
      heartbeatChart.data.datasets[0].pointRadius = 4;
    } else {
      // 多个点时，只在末尾显示点
      const pointRadiusArray = Array(speedHistory.length).fill(0);
      pointRadiusArray[speedHistory.length - 1] = 3;
      heartbeatChart.data.datasets[0].pointRadius = pointRadiusArray;
    }

    // 应用更新
    heartbeatChart.update();
  }

  // 下载速度显示优化
  const speedElement = document.getElementById('downloadSpeed');

  if (isError) {
    speedElement.textContent = '连接错误';
    speedElement.className = 'text-red-500';
  } else {
    // 添加趋势指示器
    let trendIndicator = '';
    if (speedHistory.length >= 2) {
      const current = speedHistory[speedHistory.length - 1];
      const previous = speedHistory[speedHistory.length - 2];
      if (current > previous * 1.1) {
        trendIndicator = ' ↑'; // 上升
      } else if (current < previous * 0.9) {
        trendIndicator = ' ↓'; // 下降
      }
    }

    // 格式化速度，为0时特殊处理
    if (currentSpeed === 0) {
      speedElement.textContent = '待机中';
      speedElement.className = 'text-gray-400';
    } else {
      speedElement.textContent = formatBytes(currentSpeed) + '/s' + trendIndicator;
      speedElement.className = 'text-blue-500 font-bold';
    }
  }

  // 确保tooltip始终可见，无需hover
  const tooltip = document.getElementById('speedTooltip');
  if (tooltip) {
    tooltip.classList.remove('opacity-0', 'group-hover:opacity-100', 'pointer-events-none');
    tooltip.classList.add('opacity-100');
  }
}





// 设置所有事件监听器
function setupEventListeners() {
  // 添加任务按钮
  document.getElementById('addTaskBtn').addEventListener('click', () => {
    document.getElementById('addTaskModal').style.display = 'flex';
    document.getElementById('addTaskModal').classList.remove('hidden');
  });

  // 关闭模态框
  document.querySelector('.close-modal').addEventListener('click', () => {
    document.getElementById('addTaskModal').style.display = 'none';
  });

  document.querySelector('.cancel-btn').addEventListener('click', () => {
    document.getElementById('addTaskModal').style.display = 'none';
  });

  // 提交添加任务表单
  document.querySelector('.confirm-btn').addEventListener('click', addNewDownloadTask);

  // 切换到设置页面
  document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('settingsContent').classList.remove('hidden');
  });

  // 切换回主页面
  document.getElementById('backToMain').addEventListener('click', () => {
    document.getElementById('settingsContent').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
  });

  // 清空任务按钮
  document.getElementById('clearTasksBtn').addEventListener('click', clearAllTasks);

  // 测试连接按钮
  document.getElementById('testConnection').addEventListener('click', testConnection);

  // 保存设置按钮
  document.getElementById('saveSettings').addEventListener('click', saveSettings);

  // 重置设置按钮
  document.getElementById('resetSettings').addEventListener('click', resetSettings);

  // 高级选项切换
  document.getElementById('advancedOptionsToggle').addEventListener('click', toggleAdvancedOptions);

  // 为下载列表添加委托事件处理
  document.getElementById('download-list').addEventListener('click', handleDownloadItemAction);

  // 添加鼠标悬停事件处理
  const heartbeatContainer = document.getElementById('downloadHeartbeat').parentNode;

  heartbeatContainer.addEventListener('mouseenter', function () {
    document.getElementById('speedTooltip').style.opacity = 1;
  });

  heartbeatContainer.addEventListener('mouseleave', function () {
    document.getElementById('speedTooltip').style.opacity = 0;
  });

  // 页面关闭前清除定时器
  window.addEventListener('beforeunload', function () {
    clearInterval(speedMonitorInterval);
  });
}

// 高级选项显示/隐藏切换
function toggleAdvancedOptions() {
  const content = document.getElementById('advancedOptionsContent');
  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
  } else {
    content.classList.add('hidden');
  }
}

// 添加新下载任务
function addNewDownloadTask() {
  const url = document.getElementById('downloadUrl').value;

  if (url) {
    // 获取高级选项
    const priority = document.getElementById('downloadPriority').value;
    const connections = document.getElementById('connections').value;

    // 构建下载选项
    const options = {
      maxConnectionPerServer: connections,
      priority: priority
    };

    addDownloadTask(url, options)
    // 关闭模态窗口并重置表单
    document.getElementById('addTaskModal').style.display = 'none';
    document.getElementById('downloadUrl').value = '';
    document.getElementById('connections').value = '5';
    document.getElementById('downloadPriority').value = '0';
  } else {
    alert('请输入下载链接');
  }
}
// 清空所有任务
function clearAllTasks() {
  // 检查下载列表是否为空
  const downloadList = document.getElementById('download-list');
  if (!downloadList || downloadList.querySelector('.empty-list')) {
    alert('下载列表为空，无需清空！');
    return;
  }

  if (confirm('确定要清空所有下载任务吗？')) {
    purgeDownloadResult()
  }
}

function refreshMainPage() {
  // 如果当前显示的是主页面，则刷新
  if (!document.getElementById('mainContent').classList.contains('hidden')) {
    renderDownloads(); // 重新渲染下载列表
  }
}

// 初始化与Aria2的连接
function initAria2Connection() {
  updateConnectionIndicator();
}


// 创建下载项元素 - 严格按照原始HTML样式和结构
function createDownloadItemElement(item, template) {
  try {
    // 使用Mustache渲染模板
    const rendered = Mustache.render(template, item);

    // 创建临时容器以转换HTML字符串为DOM元素
    const temp = document.createElement('div');
    temp.innerHTML = rendered;

    // 获取渲染后的DOM元素
    const itemElement = temp.firstElementChild;
    itemElement.setAttribute('data-gid', item.gid);
    itemElement.setAttribute('data-status', item.status);

    // 设置进度条颜色 - 严格按照原始样式
    const progressBar = itemElement.querySelector('.progress-bar');
    if (progressBar) {
      // 移除所有可能的颜色类
      progressBar.classList.remove('bg-blue-600', 'bg-amber-400', 'bg-gray-600');

      // 根据状态添加正确的颜色类
      switch (item.status) {
        case 'active':
          progressBar.classList.add('bg-blue-600');
          break;
        case 'paused':
          progressBar.classList.add('bg-amber-400');
          break;
        case 'waiting':
          progressBar.classList.add('bg-gray-600');
          break;
      }
    }

    // 为按钮添加gid属性和action属性
    itemElement.querySelectorAll('button[title]').forEach(button => {
      button.setAttribute('data-gid', item.gid);

      // 根据title添加action属性
      switch (button.title) {
        case '暂停':
          button.setAttribute('data-action', 'pause');
          break;
        case '继续':
          button.setAttribute('data-action', 'resume');
          break;
        case '删除':
          button.setAttribute('data-action', 'remove');
          break;
        case '打开文件夹':
          button.setAttribute('data-action', 'open');
          break;
        case '重试':
          button.setAttribute('data-action', 'retry');
          break;
      }
    });

    // 根据状态显示/隐藏特定元素
    const statusElements = itemElement.querySelectorAll('[data-show-on]');
    statusElements.forEach(element => {
      const showOn = element.getAttribute('data-show-on').split(',');
      if (!showOn.includes(item.status)) {
        element.style.display = 'none';
      }
    });

    // 设置状态标签样式 - 严格按照原始样式
    const statusBadge = itemElement.querySelector('.status-badge');
    if (statusBadge) {
      // 移除所有可能的样式类
      statusBadge.className = 'status-badge px-2 py-0.5 rounded-full';
      // 确保状态文本被设置
      statusBadge.textContent = item.status_text;
      // 根据状态添加正确的样式类
      switch (item.status) {
        case 'active':
          statusBadge.classList.add('bg-blue-100', 'text-blue-700', 'border', 'border-blue-200');
          break;
        case 'paused':
          statusBadge.classList.add('bg-amber-100', 'text-amber-700', 'border', 'border-amber-200');
          break;
        case 'waiting':
          statusBadge.classList.add('bg-gray-100', 'text-gray-700', 'border', 'border-gray-200');
          break;
        case 'error':
          statusBadge.classList.add('bg-red-100', 'text-red-700', 'border', 'border-red-200');
          break;
        case 'complete':
          statusBadge.classList.add('bg-emerald-100', 'text-emerald-700', 'border', 'border-emerald-200');
          break;
      }
    }


    // 设置状态标签样式 - 严格按照原始样式
    const statusBadge1 = itemElement.querySelector('.status-badge-other');
    if (statusBadge1) {
      // 移除所有可能的样式类
      statusBadge1.className = 'status-badgeother px-2 py-0.5 rounded-full';
      // 确保状态文本被设置
      statusBadge1.textContent = item.status_text;
      // 根据状态添加正确的样式类
      switch (item.status) {
        case 'active':
          statusBadge1.classList.add('bg-blue-100', 'text-blue-700', 'border', 'border-blue-200');
          break;
        case 'paused':
          statusBadge1.classList.add('bg-amber-100', 'text-amber-700', 'border', 'border-amber-200');
          break;
        case 'waiting':
          statusBadge1.classList.add('bg-gray-100', 'text-gray-700', 'border', 'border-gray-200');
          break;
        case 'error':
          statusBadge1.classList.add('bg-red-100', 'text-red-700', 'border', 'border-red-200');
          break;
        case 'complete':
          statusBadge1.classList.add('bg-emerald-100', 'text-emerald-700', 'border', 'border-emerald-200');
          break;
      }
    }

    // 添加淡入动画
    itemElement.style.opacity = '0';
    itemElement.style.transition = 'opacity 0.3s ease';

    // 确保动画有效果
    setTimeout(() => {
      itemElement.style.opacity = '1';
    }, 10);

    return itemElement;
  } catch (error) {
    console.error('创建下载项元素时出错:', error, item);
    return document.createElement('div'); // 返回空元素防止错误
  }
}



// 更新下载列表UI - 智能更新仅变动部分
function updateDownloadListUI(downloadItems) {
  const container = document.getElementById('download-list');
  if (!container) {
    console.error('找不到下载列表容器元素');
    return;
  }

  // 设置容器样式
  container.className = 'space-y-3';

  // 处理空列表情况
  if (!downloadItems || downloadItems.length === 0) {
    showEmptyList(container);
    currentDownloadItems = {};
    return;
  }

  // 如果是首次加载或从空状态转为有数据，清空容器
  if (Object.keys(currentDownloadItems).length === 0 || container.querySelector('.empty-list')) {
    container.innerHTML = '';
  }

  // 获取或创建模板
  let template = document.getElementById('download-item-template');
  if (!template) {
    createDownloadItemTemplate();
    template = document.getElementById('download-item-template');
  }
  const templateHTML = template.innerHTML;

  // 跟踪已处理的项目
  const processedItems = {};
  // 处理每个下载项
  downloadItems.forEach(item => {
    const gid = item.gid;
    processedItems[gid] = true;

    // 检查项目是否已存在
    const existingElement = container.querySelector(`[data-gid="${gid}"]`);
    // 如果项目已存在，检查是否需要更新
    if (existingElement) {
      // 更新现有元素
      updateSingleDownloadItem(existingElement, item, templateHTML);

    } else {
      // 创建新元素
      createAndAppendNewItem(container, item, templateHTML);
    }

    // 更新当前状态
    currentDownloadItems[gid] = {
      gid: item.gid,
      status: item.status
    };
  });
  // 移除不再存在的项目
  removeObsoleteItems(container, processedItems);
}
// 更新单个下载项
function updateSingleDownloadItem(existingElement, item, templateHTML) {
  const gid = item.gid;
  const currentItem = currentDownloadItems[gid];

  if (needsUpdate(currentItem, item)) {
    // // 创建新元素
    const newElement = createDownloadItemElement(item, templateHTML);
    // 替换现有元素
    existingElement.parentNode.replaceChild(newElement, existingElement);
    // 高亮显示变化
    if (currentItem && currentItem.status !== item.status) {
      newElement.style.transition = 'background-color 0.5s ease';

      // 根据新状态选择高亮颜色
      let highlightColor;
      switch (item.status) {
        case 'active':
          highlightColor = '#e6f7ff';
          break;
        case 'waiting':
          highlightColor = '#f9f0ff';  // Light purple for waiting status
          break;
        case 'complete':
          highlightColor = '#e6ffed';
          break;
        case 'paused':
          highlightColor = '#fff7e6';
          break;
        case 'error':
          highlightColor = '#fff1f0';
          break;
        default:
          highlightColor = '#f0f9ff';
      }

      newElement.style.backgroundColor = highlightColor;

      // 恢复原始背景色
      setTimeout(() => {
        newElement.style.backgroundColor = '';
      }, 800);
    }
  }
}

// 创建并添加新项目
function createAndAppendNewItem(container, item, templateHTML) {
  const newElement = createDownloadItemElement(item, templateHTML);
  container.appendChild(newElement);

  // 只存储必要的字段，而不是整个item对象
  currentDownloadItems[item.gid] = {
    gid: item.gid,
    status: item.status
  };
}
// 移除不再存在的项目
function removeObsoleteItems(container, processedItems) {
  Object.keys(currentDownloadItems).forEach(gid => {
    if (!processedItems[gid]) {
      const element = container.querySelector(`[data-gid="${gid}"]`);
      if (element) {
        // 添加淡出动画
        element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        element.style.opacity = '0';
        element.style.transform = 'translateX(10px)';

        // 动画完成后移除元素
        setTimeout(() => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
        }, 300);
      }

      // 从当前状态和冻结集合中移除
      delete currentDownloadItems[gid];
    }
  });
}


// 需要更新的判断逻辑
function needsUpdate(oldItem, newItem) {
  if (!oldItem || oldItem.status !== newItem.status) return true;

  // 简化逻辑：活跃下载和等待中的下载需要更新
  return ['active', 'waiting'].includes(newItem.status);

}

// 处理下载项的操作（暂停、继续、删除等）- 不修改按钮样式
function handleDownloadItemAction(event) {
  // 寻找被点击的按钮
  const target = event.target.closest('button[data-action]');
  if (!target) return;

  const action = target.getAttribute('data-action');
  const gid = target.getAttribute('data-gid');

  if (!gid) return;

  // 找到当前操作的下载项
  const element = document.querySelector(`[data-gid="${gid}"]`);
  if (!element) return;

  // 创建一个覆盖层，用于显示加载状态
  const overlay = document.createElement('div');
  overlay.className = 'absolute inset-0 bg-black/10 flex items-center justify-center rounded-lg z-10';
  overlay.innerHTML = '<div class="animate-spin"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6 text-white"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg></div>';

  // 确保元素有相对定位，以便覆盖层能够正确定位
  const originalPosition = element.style.position;
  element.style.position = 'relative';

  // 添加覆盖层
  element.appendChild(overlay);

  // 禁用所有按钮以防止多次点击
  const buttons = element.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.disabled = true;
  });

  // 执行操作
  let actionPromise;
  switch (action) {
    case 'pause':
      actionPromise = pauseDownload(gid);
      break;
    case 'resume':
      actionPromise = resumeDownload(gid);
      break;
    case 'remove':
      actionPromise = removeDownload(gid);
      // 添加淡出效果
      element.style.opacity = '0';
      break;
    case 'open':
      actionPromise = openDownloadFolder(gid);
      break;
    case 'retry':
      actionPromise = retryDownload(gid);
      break;
  }

  // 处理操作结果
  if (actionPromise) {
    actionPromise.then(() => {
      // 操作成功后刷新列表
      setTimeout(() => {
        renderDownloads();
      }, 500);
    }).catch(error => {
      console.error(`执行${action}操作失败:`, error);

      // 移除覆盖层
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }

      // 恢复元素的原始定位
      element.style.position = originalPosition;

      // 启用所有按钮
      buttons.forEach(btn => {
        btn.disabled = false;
      });

      // 显示错误提示
      showErrorToast(`操作失败: ${error.message || '未知错误'}`);

      // 刷新显示当前状态
      renderDownloads();
    });
  }
}

// 显示错误提示
function showErrorToast(message) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-4 left-4 bg-red-100 text-red-700 px-4 py-2 rounded-lg shadow-md z-50';
  toast.textContent = message;
  document.body.appendChild(toast);

  // 3秒后自动淡出
  setTimeout(() => {
    toast.style.transition = 'opacity 0.5s ease';
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 500);
  }, 3000);
}





// 渲染下载列表 - 修改为显示加载指示器时不清空整个列表
function renderDownloads() {
  // 找到正确的容器元素
  const container = document.getElementById('download-list');
  if (!container) {
    console.error('找不到下载列表容器元素');
    return;
  }

  // 检查是否正在加载
  if (container.querySelector('.loading-indicator')) {
    return; // 已经在加载，避免重复请求
  }

  // 显示加载状态 (仅在首次加载或容器为空时)
  if (Object.keys(currentDownloadItems).length === 0 || container.children.length === 0) {
    container.innerHTML = '<div class="p-8 text-center text-gray-500 loading-indicator"><div class="inline-block animate-spin mr-2"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg></div>加载中...</div>';
  }

  // 获取所有任务并渲染
  getAllAria2Tasks()
    .then(results => {
      // 移除加载指示器
      const loadingIndicator = document.getElementById('loading-indicator');
      if (loadingIndicator) {
        loadingIndicator.remove();
      }

      if (!results || !Array.isArray(results)) {
        if (Object.keys(currentDownloadItems).length === 0) {
          container.innerHTML = '<div class="p-8 text-center text-gray-500 empty-list">无法获取下载任务</div>';
        }
        return;
      }

      // 处理获取到的任务数据
      const activeTasks = Array.isArray(results[0]) ? results[0].flat() : [];
      const waitingTasks = Array.isArray(results[1]) ? results[1].flat() : [];
      const stoppedTasks = Array.isArray(results[2]) ? results[2].flat() : [];

      // 转换数据格式为前端可用的格式
      const downloadItems = [];

      // 处理活跃任务
      activeTasks.forEach(task => {
        downloadItems.push(convertTaskToDownloadItem(task));
      });

      // 处理等待任务
      waitingTasks.forEach(task => {
        downloadItems.push(convertTaskToDownloadItem(task));
      });

      // 处理已完成/已停止任务
      stoppedTasks.forEach(task => {
        downloadItems.push(convertTaskToDownloadItem(task));
      });

      // 使用下载项数据更新UI
      updateDownloadListUI(downloadItems);
    })
    .catch(error => {
      console.error('获取下载列表时出错:', error);

      // 清除加载指示器
      const loadingElement = container.querySelector('.loading-indicator');
      if (loadingElement) {
        container.removeChild(loadingElement);
      }

      if (Object.keys(currentDownloadItems).length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray-500 empty-list">获取下载任务失败</div>';
      }
    });
}

// 添加下载任务
function addDownloadTask(url, options) {
  console.log("Adding download task:", url, "options:", options);
  // 将URL发送到后台脚本处理
  chrome.runtime.sendMessage({
    action: 'addDownload',
    url: url,
    options: options,
  });
  // 需要刷新界面
  renderDownloads();
}

// WebSocket 连接
let ws;
// 连接到 Aria2 的 WebSocket
function connectWebSocket() {
  ws = new WebSocket('ws://localhost:6800/jsonrpc');
  // WebSocket 连接成功
  ws.onopen = () => {
    console.log('WebSocket 连接已建立');
  };
  // 收到消息时的处理
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('收到状态变化通知:', data);
  };
  // WebSocket 错误处理
  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error);
    // 尝试重新连接
    setTimeout(connectWebSocket, 5000); // 5 秒后重试
  };
  // WebSocket 连接关闭
  ws.onclose = () => {
    console.log('WebSocket 连接已关闭');
    // 尝试重新连接
    setTimeout(connectWebSocket, 2000); // 5 秒后重试
  };
}


// 初始化 WebSocket 连接
connectWebSocket();
// 监听弹出窗口关闭事件
window.addEventListener('unload', () => {
  if (ws) {
    ws.close(); // 关闭 WebSocket 连接
  }
});

// 加载设置
function loadSettings() {
  chrome.storage.sync.get({
    aria2host: 'localhost',
    aria2port: 6800,
    aria2secure: false,
    aria2secret: '',
    aria2path: '/jsonrpc',
    aria2enabled: true,
    aria2fileSize: 10
  }, (items) => {
    // 更新本地配置
    aria2Config.host = items.aria2host;
    aria2Config.port = items.aria2port;
    aria2Config.secure = items.aria2secure;
    aria2Config.secret = items.aria2secret;
    aria2Config.path = items.aria2path;
    aria2Config.enabled = items.aria2enabled;
    aria2Config.fileSize = items.aria2fileSize;

    // 更新表单
    document.getElementById('aria2host').value = items.aria2host;
    document.getElementById('aria2port').value = items.aria2port;
    document.getElementById('aria2path').value = items.aria2path;
    document.getElementById('aria2secret').value = items.aria2secret;
    document.getElementById('aria2secure').checked = items.aria2secure;
    document.getElementById('aria2enabled').checked = items.aria2enabled;
    document.getElementById('aria2fileSize').value = items.aria2fileSize;
  });
}


// 保存设置
function saveSettings() {
  let config = {
    host: document.getElementById('aria2host').value,
    port: parseInt(document.getElementById('aria2port').value),
    path: document.getElementById('aria2path').value,
    secure: document.getElementById('aria2secure').checked,
    secret: document.getElementById('aria2secret').value,
    enabled: document.getElementById('aria2enabled').checked,
    fileSize: parseInt(document.getElementById('aria2fileSize').value)
  };

  // Check for invalid inputs
  if (isNaN(config.port) || config.port <= 0) {
    showStatusMessage('端口号无效', 'error');
    return;
  }

  if (isNaN(config.fileSize) || config.fileSize < 0) {
    showStatusMessage('文件大小无效', 'error');
    return;
  }
  // Create storage object with aria2 prefix
  let storageData = {};
  for (let key in config) {
    storageData['aria2' + key] = config[key];
  }
  chrome.storage.sync.set(storageData, function () {
    if (chrome.runtime.lastError) {
      showStatusMessage('保存设置失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }

    // Update local config
    for (let key in config) {
      aria2Config[key] = config[key];
    }

    // Update background script config
    chrome.runtime.sendMessage({
      action: 'saveConfig',
      config: config
    });

    // Show success message
    showStatusMessage('设置已保存', 'success');

    // 更新连接状态指示器
    updateConnectionIndicator();
    loadSettings();
  });
}
function showStatusMessage(message, type) {
  let statusEl = document.getElementById('connectionStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = message;
  statusEl.className = 'connection-status ' + type;

  // Hide message after 3 seconds
  setTimeout(function () {
    statusEl.style.display = 'none';
  }, 3000);
}
// 重置设置
function resetSettings() {
  // 默认设置
  document.getElementById('aria2host').value = 'localhost';
  document.getElementById('aria2port').value = '6800';
  document.getElementById('aria2path').value = '/jsonrpc';
  document.getElementById('aria2secret').value = '';
  document.getElementById('aria2secure').checked = false;
  document.getElementById('aria2enabled').checked = true;
  document.getElementById('aria2fileSize').value = '10';

  // 隐藏状态提示
  const statusEl = document.getElementById('connectionStatus');
  statusEl.style.display = 'none';
}



// 查询进行中的下载
function testConnection() {
  const statusEl = document.getElementById('connectionStatus');
  statusEl.style.display = 'block';
  statusEl.textContent = '正在测试连接...';
  statusEl.className = 'connection-status';
  sendAria2Request("aria2.getVersion", [])
    .then(task => {
      if (task.version) {
        statusEl.textContent = `连接成功！Aria2 版本: ${task.version}`;
        statusEl.className = 'connection-status success';
      } else {
        statusEl.textContent = '连接失败: 无效的响应数据';
        statusEl.className = 'connection-status error';
      }
    })
    .catch(error => {
      statusEl.textContent = `连接失败: ${error.message}`;
      statusEl.className = 'connection-status error';
    });
}

// 更新连接状态指示器// 更新连接状态指示器
function updateConnectionIndicator() {
  const indicator = document.getElementById('connectionIndicator');

  // 检查连接配置
  if (!aria2Config.host || !aria2Config.port) {
    indicator.textContent = '未配置';
    indicator.className = 'px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1.5';
    indicator.querySelector('span').className = 'w-2 h-2 rounded-full bg-gray-500';
    return;
  }
  sendAria2Request("aria2.getVersion", [])
    .then(task => {
      if (task.version) {
        indicator.textContent = '已连接';
        indicator.className = 'px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1.5';
        // 更新脉冲点样式
        const pulseSpan = document.createElement('span');
        pulseSpan.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
        indicator.prepend(pulseSpan);
      } else {
        throw new Error('连接失败');

      }
    })
    .catch(error => {
      indicator.textContent = '连接失败';
      indicator.className = 'px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200 flex items-center gap-1.5';
      // 更新脉冲点样式
      const pulseSpan = document.createElement('span');
      pulseSpan.className = 'w-2 h-2 rounded-full bg-red-500';
      indicator.prepend(pulseSpan);
    });
}
// 添加获取单个任务的函数
function getAria2Task(gid) {
  return sendAria2Request('aria2.tellStatus', [gid]);
}
function getAllAria2Tasks() {
  const host = document.getElementById('aria2host').value || 'localhost';
  const port = document.getElementById('aria2port').value || '6800';
  const path = document.getElementById('aria2path').value || '/jsonrpc';
  const secure = document.getElementById('aria2secure').checked;
  const secret = document.getElementById('aria2secret').value;

  const rpcUrl = `${secure ? 'https' : 'http'}://${host}:${port}${path}`;

  // 准备 RPC 请求
  const multicallParams = [];

  const addMethod = (methodName, params) => {
    const methodCall = {
      methodName: methodName,
      params: params,
    };
    multicallParams.push(methodCall);
  };


  if (secret) {
    addMethod("aria2.tellActive", [`token:${secret}`]);
    addMethod("aria2.tellWaiting", [`token:${secret}`, [0, 1000]]);
    addMethod("aria2.tellStopped", [`token:${secret}`, [0, 1000]]);
  } else {
    addMethod("aria2.tellActive", []);
    addMethod("aria2.tellWaiting", [0, 1000]);
    addMethod("aria2.tellStopped", [0, 1000]);
  }
  return fetch(rpcUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method: 'system.multicall',
      params: [multicallParams],
    }),
  })
    .then(response => response.json())
    .then(data => data.result)
    .catch(error => {
      console.error('获取任务时出错:', error);
      return [];
    });
}

// 发送HTTP请求给Aria2服务器
function sendAria2Request(method, params = []) {
  return new Promise((resolve, reject) => {
    // 构建HTTP URL
    const protocol = aria2Config.secure ? 'https' : 'http';
    const url = `${protocol}://${aria2Config.host}:${aria2Config.port}${aria2Config.path}`;

    // 添加密钥参数
    if (aria2Config.secret) {
      params.unshift(`token:${aria2Config.secret}`);
    }

    // 构建请求体
    const requestId = Date.now().toString();
    const requestBody = {
      jsonrpc: '2.0',
      method: method,
      id: requestId,
      params: params
    };

    // 发送HTTP POST请求
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP错误，状态码: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.result !== undefined) {
          resolve(data.result);
        } else if (data.error) {
          reject(new Error(data.error.message));
        } else {
          reject(new Error('未知响应格式'));
        }
      })
      .catch(error => {
        console.error('Aria2请求错误:', error);
        updateConnectionIndicator(false);
        reject(error);
      });
  });
}

// 创建下载项模板 
function createDownloadItemTemplate() {
  // 创建模板元素
  const template = document.createElement('template');
  template.id = 'download-item-template';

  // 设置模板HTML内容
  template.innerHTML = `
    <div class="p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div class="flex justify-between items-start mb-2">
        <div class="truncate flex-1 pr-2">
          <h3 class="font-medium truncate text-gray-800">{{filename}}</h3>
          <p class="text-xs text-gray-500 mt-0.5 truncate">{{url}}</p>
        </div>
        <div class="flex items-center gap-1">
          <!-- 状态特定按钮 - 将根据状态显示/隐藏 -->
          <!-- active状态 - 显示暂停按钮 -->
          <button class="action-btn p-1.5 rounded-lg hover:bg-gray-100 transition-all" data-show-on="active,waiting"
            title="暂停">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-gray-600">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>

          <!-- paused状态 - 显示继续按钮 -->
          <button class="action-btn p-1.5 rounded-lg hover:bg-gray-100 transition-all" data-show-on="paused"
            title="继续">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-gray-600">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>

          <!-- complete状态 - 显示文件夹按钮 -->
          <button class="action-btn p-1.5 rounded-lg hover:bg-gray-100 transition-all" data-show-on="complete"
            title="打开文件夹">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-gray-600">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </button>

          <!-- error状态 - 显示重试按钮 -->
          <button class="action-btn p-1.5 rounded-lg hover:bg-gray-100 transition-all" data-show-on="error"
            title="重试">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-gray-600">
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
              <path d="M3 22v-6h6"></path>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
            </svg>
          </button>

          <!-- 所有状态都有删除按钮 -->
          <button class="p-1.5 rounded-lg hover:bg-gray-100 transition-all" title="删除">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-4 h-4 text-gray-600">
              <path d="M3 6h18"></path>
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- 进度信息部分 - 对于active、paused、waiting状态显示 -->
      <div class="progress-container mt-2" data-show-on="active,paused,waiting">
        <div class="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <!-- 进度条颜色根据状态变化 -->
          <div class="h-full rounded-full progress-bar" style="width: {{progress}}%"></div>
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-500">
          <div>{{downloaded}} / {{total}} ({{progress}}%)</div>
          <div class="flex items-center gap-1" data-show-on="active">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
              class="w-3 h-3 text-gray-500">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>{{speed}}/s</span>
          </div>
          <div class="flex items-center gap-1" data-show-on="paused,waiting">
            <span class="status-badge px-2 py-0.5 rounded-full" data-show-on="{{status}}" data-status="{{status}}">{{status_text}}</span>
          </div>         
        </div>
      </div>

      <!-- 状态信息部分 - 对于complete、error、waiting状态显示 -->
      <div class="status-container flex justify-between mt-2 text-xs text-gray-500"
        data-show-on="complete,error">
        <div data-show-on="complete">{{filesize}}</div>
        <div data-show-on="error">{{error_message}}</div>
        <div data-show-on="waiting">排队等待中...</div>
        <div class="flex items-center gap-1.5">
          <!-- 状态标签 - 根据状态显示不同样式 -->
          <span class="status-badge-other px-2 py-0.5 rounded-full" data-show-on="{{status}}" data-status="{{status}}">{{status_text}}</span>
        </div>
      </div>
    </div>
  `;

  // 添加到文档中
  document.body.appendChild(template);

  return template;
}


// 显示空列表
function showEmptyList(container) {
  if (!container.querySelector('.empty-list')) {
    container.innerHTML = `
      <div class="flex items-center justify-center h-24 p-2 rounded-lg bg-gray-50 empty-list">
        <div class="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-8 h-8 text-gray-300 mx-auto mb-2">
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
            <path d="M12 12v9"></path><path d="m8 17 4 4 4-4"></path>
          </svg>
          <p class="text-gray-500 text-sm">暂无下载任务</p>
        </div>
      </div>
    `;
  }
}

// 将Aria2任务数据转换为前端显示格式
function convertTaskToDownloadItem(task) {
  // 提取文件名
  let filename = '未知文件';
  let url = '';

  if (task.files && task.files.length > 0) {
    if (task.files[0].path) {
      const path = task.files[0].path;
      const parts = path.split('/');
      filename = parts[parts.length - 1];
    }

    if (task.files[0].uris && task.files[0].uris.length > 0) {
      url = task.files[0].uris[0].uri;
      if (!filename || filename === '未知文件') {
        const urlParts = url.split('/');
        filename = urlParts[urlParts.length - 1] || '未知文件';
      }
    }
  }

  // 计算进度
  let progress = 0;
  let downloaded = '0 B';
  let total = '未知';
  let speed = '0 B';
  let status_text = '未知';
  if (task.completedLength && task.totalLength) {
    const completedLength = parseInt(task.completedLength);
    const totalLength = parseInt(task.totalLength);

    if (totalLength > 0) {
      progress = Math.round((completedLength / totalLength) * 100);
    }

    downloaded = formatBytes(completedLength);
    total = formatBytes(totalLength);
  }

  if (task.downloadSpeed) {
    speed = formatBytes(parseInt(task.downloadSpeed));
  }

  // 错误信息
  let errorMessage = '';
  if (task.errorCode && task.errorCode !== '0') {
    errorMessage = `错误代码: ${task.errorCode}`;
    if (task.errorMessage) {
      errorMessage += ` - ${task.errorMessage}`;
    }
  }

  if (task.status === 'active') {
    status_text = '下载中';
  } else if (task.status === 'complete') {
    status_text = '已完成';
  } else if (task.status === 'paused') {
    status_text = '已暂停';
  } else if (task.status === 'error') {
    status_text = '错误';
  } else if (task.status === 'waiting') {
    status_text = '等待中';
  }

  return {
    gid: task.gid,
    filename: filename,
    url: url,
    status: task.status,
    status_text: status_text,
    progress: progress,
    downloaded: downloaded,
    total: total,
    speed: speed,
    error_message: errorMessage.slice(0, 40),
    filesize: total
  };
}

// 格式化字节数为可读大小
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// 暂停下载
function pauseDownload(gid) {
  sendAria2Request('aria2.pause', [gid])
    .then(() => renderDownloads())
    .catch(error => console.error('暂停下载时出错:', error));
}

// 继续下载
function resumeDownload(gid) {
  sendAria2Request('aria2.unpause', [gid])
    .then(() => renderDownloads())
    .catch(error => console.error('继续下载时出错:', error));
}

// 删除下载
function removeDownload(gid) {
  getAria2Task(gid)
    .then(task => {
      if (task.status === 'active') {
        //活动中任务 强制删除后状态为removed  需要再调用删除结果
        forceRemoveActiveDownload(gid);
      } else if (task.status === 'waiting' || task.status === 'paused') {
        forceRemoveDownload(gid);
      } else {
        removeDownloadResult(gid);
      }
    })
    .then(() => renderDownloads())
    .catch(error => console.error('删除下载任务出错:', error));
}

function aria2RemoveDownload(gid) {
  sendAria2Request('aria2.remove', [gid])
    .then(() => renderDownloads())
    .catch(error => console.error('删除下载时出错:', error));
}
// 删除下载
function forceRemoveDownload(gid) {
  sendAria2Request('aria2.forceRemove', [gid])
    .then(() => renderDownloads())
    .catch(error => console.error('删除下载时出错:', error));
}
// 删除下载
function forceRemoveActiveDownload(gid) {
  sendAria2Request('aria2.forceRemove', [gid])
    .then(() => removeDownloadResult(gid))
    .then(() => renderDownloads())
    .catch(error => console.error('删除下载时出错:', error));
}
function removeDownloadResult(gid) {
  sendAria2Request('aria2.removeDownloadResult', [gid])
    .then(() => renderDownloads())
    .catch(error => console.error('删除下载结果时出错:', error));
}
function purgeDownloadResult() {
  sendAria2Request('aria2.purgeDownloadResult', [])
    .then(() => renderDownloads())
    .catch(error => console.error('清空下载结果出错:', error));
}
function getGlobalStat() {
  return sendAria2Request('aria2.getGlobalStat', []);
}
// 重试下载
function retryDownload(gid) {
  // 先获取任务信息
  getAria2Task(gid)
    .then(task => {
      if (task.files && task.files.length > 0 && task.files[0].uris && task.files[0].uris.length > 0) {
        const url = task.files[0].uris[0].uri;
        // 构建下载选项
        const options = {
        };
        // 先删除旧任务
        sendAria2Request('aria2.removeDownloadResult', [gid])
          .then(() => {
            // 添加新任务
            addDownloadTask(url, options);
          });
      } else {
        throw new Error('获取下载链接失败');
      }
    })
    .then(() => renderDownloads())
    .catch(error => console.error('重试下载时出错:', error));
}

// 打开下载文件夹
function openDownloadFolder(gid) {
  // 获取任务信息
  return sendAria2Request('aria2.tellStatus', [gid])
    .then(task => {
      if (task.dir) {
        // 如果在插件环境中，发送消息给background.js打开文件夹
        if (chrome && chrome.runtime) {
          chrome.runtime.sendMessage({
            action: 'openFolder',
            path: task.dir
          });
        }
      }
    });
}