(function () {
  var shots = {
    home: {
      src: "assets/hero.png",
      alt: "风向首页：按时间排列的全球企业服务官方动态",
      caption: "首页：时间线在左，推荐阅读和订阅在右。",
      mobile: false
    },
    daily: {
      src: "assets/daily.png",
      alt: "每日精选：一期分节排列的页面",
      caption: "每日精选：每天一期，编辑挑出值得看的几条，分节排列。",
      mobile: false
    },
    item: {
      src: "assets/item.png",
      alt: "条目页：中文摘要、原文对照与阅读工具",
      caption: "条目页：中文摘要、中英对照、收藏与字号工具。",
      mobile: false
    },
    topics: {
      src: "assets/topics.png",
      alt: "企业厂商目录：按公司归档与筛选",
      caption: "企业厂商：按公司归档，每家有介绍、近 30 天条数和最近更新。",
      mobile: false
    },
    mobile: {
      src: "assets/mobile.png",
      alt: "手机端首页",
      caption: "手机端：动态、每日精选、我的三个入口。",
      mobile: true
    },
    agent: {
      src: "assets/agent.png",
      alt: "Agent 接入页：MCP、RSS、公开 API",
      caption: "Agent 接入：MCP、RSS、公开 API，匿名只读。",
      mobile: false
    }
  };

  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  var shot = document.getElementById("shot");
  var shotLink = document.getElementById("shot-link");
  var openOriginal = document.getElementById("open-original");
  var caption = document.getElementById("caption");
  var frame = document.getElementById("frame");

  function select(key) {
    var item = shots[key];
    if (!item) return;
    shot.src = item.src;
    shot.alt = item.alt;
    shotLink.href = item.src;
    openOriginal.href = item.src;
    caption.textContent = item.caption;
    frame.classList.toggle("is-mobile", item.mobile);
    tabs.forEach(function (tab) {
      var active = tab.getAttribute("data-shot") === key;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      select(tab.getAttribute("data-shot"));
    });
  });
})();
