(function(){
  var files=["sl-a1.js?v=a91c2d","sl-a2.js?v=a91c2d","sl-a3.js?v=a91c2d"];
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
        if(x.status>=200 && x.status<300){ acc+=x.responseText; step(); }
        else { var f=document.getElementById("fail"); if(f){ f.style.display="flex"; f.textContent="Failed to load game "+x.status; } }
      }
    };
    x.send();
  }
  step();
})();
