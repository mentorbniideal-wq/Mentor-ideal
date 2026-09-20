(function(global){
  'use strict';

  var CLOSED={completed:true,cancelled:true,done:true};
  var WEEKDAY={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:5,Sun:6};

  function dateKey(now){
    var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now||new Date());
    var values={};parts.forEach(function(part){values[part.type]=part.value;});
    return values.year+'-'+values.month+'-'+values.day;
  }
  function weekEndKey(now){
    var weekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Bangkok',weekday:'short'}).format(now||new Date());
    var daysToSunday=6-(WEEKDAY[weekday]===undefined?0:WEEKDAY[weekday]);
    var current=dateKey(now),date=new Date(current+'T12:00:00Z');
    date.setUTCDate(date.getUTCDate()+daysToSunday);
    return date.toISOString().slice(0,10);
  }
  function isClosed(task){return !!CLOSED[String(task&&task.status||'').toLowerCase()];}
  function hasOwner(task){return !!String(task&&task.assignedOwnerEmail||'').trim();}
  function uniqueTasks(tasks){
    var seen={};return (tasks||[]).filter(function(task){var id=String(task&&task.id||'');if(!id||seen[id])return false;seen[id]=true;return true;});
  }
  function classify(tasks,options){
    options=options||{};
    var coordinator=!!options.coordinator, today=dateKey(options.now), weekEnd=weekEndKey(options.now);
    var groups={unassigned:[],overdue:[],waiting:[],due:[],remaining:[]};
    uniqueTasks(tasks).forEach(function(task){
      if(isClosed(task))return;
      var due=String(task.dueDate||'');
      if(!hasOwner(task)){
        // The API already limits regular Growth to its own OAuth-assigned
        // tasks. Keep the projection fail-closed if an unexpected record
        // reaches this browser state.
        if(coordinator)groups.unassigned.push(task);
        return;
      }
      if(due&&due<today){groups.overdue.push(task);return;}
      if(String(task.status||'')==='waiting_member'){groups.waiting.push(task);return;}
      if(due&&due>=today&&due<=weekEnd){groups.due.push(task);return;}
      groups.remaining.push(task);
    });
    return {groups:groups,today:today,weekEnd:weekEnd};
  }
  function taskBadges(task,context){
    var badges=[];var due=String(task&&task.dueDate||'');
    if(!hasOwner(task))badges.push('ยังไม่มอบหมาย');
    if(due&&due<context.today)badges.push('เกินกำหนด');
    else if(due&&due>=context.today&&due<=context.weekEnd)badges.push('ภายในสัปดาห์นี้');
    if(String(task&&task.status||'')==='waiting_member')badges.push('รอสมาชิก');
    return badges;
  }
  function safeDetail(value,restricted){
    if(restricted)return 'รายละเอียดถูกจำกัดตามสิทธิ์และการยินยอม';
    return String(value||'').trim()||'ไม่มีรายละเอียดที่แชร์ได้';
  }
  global.GrowthWeeklyBoard={dateKey:dateKey,weekEndKey:weekEndKey,uniqueTasks:uniqueTasks,classify:classify,taskBadges:taskBadges,safeDetail:safeDetail};
})(window);
