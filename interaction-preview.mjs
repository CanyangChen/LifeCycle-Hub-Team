const feedback=document.querySelector('#feedback');
for(const button of document.querySelectorAll('[data-demo]'))button.addEventListener('click',()=>{feedback.textContent='示例反馈：已触发'+button.dataset.demo+'，未修改业务数据。';});
for(const link of document.querySelectorAll('[data-nav]'))link.addEventListener('click',event=>{
 event.preventDefault();for(const item of document.querySelectorAll('[data-nav]'))item.removeAttribute('aria-current');link.setAttribute('aria-current','page');document.querySelector('#navigation-panel').textContent='当前示例页面：'+link.textContent;
});
const tabs=[...document.querySelectorAll('[role=tab]')];
function selectTab(tab){for(const item of tabs){item.setAttribute('aria-selected',String(item===tab));item.tabIndex=item===tab?0:-1;}const panel=document.querySelector('#tab-panel');panel.setAttribute('aria-labelledby',tab.id);panel.textContent='示例内容：'+tab.textContent;}
for(const tab of tabs){tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{let next;const index=tabs.indexOf(tab);if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];if(event.key==='Home')next=tabs[0];if(event.key==='End')next=tabs.at(-1);if(next){event.preventDefault();selectTab(next);next.focus();}});}
for(const input of document.querySelectorAll('input[type=checkbox],input[type=radio]'))input.addEventListener('change',()=>{feedback.textContent='示例选择已更新；选中状态由原生表单控件保留，未写入业务数据。';});
