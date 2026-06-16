function getLocation(){

const status =
document.getElementById("status");

if(!navigator.geolocation){

status.textContent =
"Geolocalização não suportada";

return;
}

navigator.geolocation.getCurrentPosition(

(position)=>{

document.getElementById("lat")
.textContent =
position.coords.latitude;

document.getElementById("lon")
.textContent =
position.coords.longitude;

status.textContent =
"Localização obtida com sucesso";

},

()=>{

status.textContent =
"Permissão negada";

}

);

}

if("serviceWorker" in navigator){

window.addEventListener("load",()=>{

navigator.serviceWorker.register("sw.js");

});

}