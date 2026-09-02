(function(){
  var files=["redwake-a1.js?v=d4e91a","redwake-a2.js?v=d4e91a","redwake-a3.js?v=d4e91a","redwake-a4.js?v=d4e91a"];
  var acc="", i=0;
  function step(){
    if(i>=files.length){
      var s=document.createElement("script");
      s.text=acc;
      document.body.appendChild(s);
      return;
    }
    var x=new XMLHttpRequest();
    x.open("GET", files[i++], true);
    x.onreadystatechange=function(){
      if(x.readyState===4){
        if(x.status>=200 && x.status<300) acc+=x.responseText;
        else console.error("Redwake load fail", files[i-1], x.status);
        step();
      }
    };
    x.send();
  }
  step();
})();
