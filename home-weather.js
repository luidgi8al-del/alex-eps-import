// Weather requests never use apiFetch: no EPS token, name, email or student data is sent.
const weatherCache=new Map();
let weatherRenderId=0;
function weatherDescription(code) {
  if(code===0)return ['☀️','Ensoleillé'];
  if(code===1)return ['🌤️','Peu nuageux'];
  if(code===2)return ['⛅','Partiellement nuageux'];
  if(code===3)return ['☁️','Couvert'];
  if([45,48].includes(code))return ['🌫️','Brouillard'];
  if([51,53,55,56,57].includes(code))return ['🌦️','Bruine'];
  if([61,63,65,66,67,80,81,82].includes(code))return ['🌧️','Pluie / averses'];
  if([71,73,75,77,85,86].includes(code))return ['🌨️','Neige'];
  if([95,96,99].includes(code))return ['⛈️','Orages'];
  return ['🌡️','Conditions indisponibles'];
}
function weatherNumber(value,unit) { return typeof value==='number' && Number.isFinite(value)?`${Math.round(value)}${unit}`:'—'; }
function weatherCityKey(){return `eps_weather_city:${session?.user_id || 'anonymous'}`;}
function weatherEnabledKey(){return `eps_weather_enabled:${session?.user_id || 'anonymous'}`;}
function weatherEnabled(){return localStorage.getItem(weatherEnabledKey())!=='false';}
function setWeatherEnabled(enabled){localStorage.setItem(weatherEnabledKey(),String(Boolean(enabled)));renderHomeWeather();}
function weatherCity(){try{return JSON.parse(localStorage.getItem(weatherCityKey())||'null');}catch{return null;}}
function validWeatherCity(city){return city && typeof city.name==='string' && Number.isFinite(city.latitude) && Number.isFinite(city.longitude) && Math.abs(city.latitude)<=90 && Math.abs(city.longitude)<=180;}
async function weatherFetch(url){
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Service météo temporairement indisponible.');
  return response.json();
}
function weatherDayHtml(daily,index,hourly={}) {
  const date=daily.time?.[index];
  const caption=typeof date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(date)?new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR',{day:'numeric',month:'long'}):'';
  const hours=(hourly.time||[]).map((time,i)=>({time,i})).filter(({time})=>{
    if(typeof time!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(time) || !time.startsWith(date+'T'))return false;
    const hour=Number(time.slice(11,13));return [8,12,16].includes(hour);
  });
  const timeline=hours.map(({time,i})=>{
    const [icon,label]=weatherDescription(hourly.weather_code?.[i]);
    const hour=time.slice(11,13)+'h';
    return `<div class="weatherHour" title="${label} · pluie ${weatherNumber(hourly.precipitation_probability?.[i],'%')} · vent ${weatherNumber(hourly.wind_speed_10m?.[i],' km/h')}"><time datetime="${time}">${hour}</time><span class="weatherSymbol" role="img" aria-label="${label}">${icon}</span><strong>${weatherNumber(hourly.temperature_2m?.[i],'°')}</strong><span>💧 ${weatherNumber(hourly.precipitation_probability?.[i],'%')}</span></div>`;
  }).join('');
  return `<article class="weatherDay"><h3>${index===0?'Aujourd’hui':'Demain'} <small>${caption}</small> <span>${weatherNumber(daily.temperature_2m_min?.[index],'°')} / ${weatherNumber(daily.temperature_2m_max?.[index],'°')}</span></h3>${hours.length?`<div class="weatherTimeline" tabindex="0" role="region" aria-label="Prévisions ${index===0?'aujourd’hui':'demain'}, toutes les trois heures">${timeline}</div>`:'<p>Prévisions horaires indisponibles.</p>'}</article>`;
}
async function renderHomeWeather() {
  const host=document.getElementById('homeWeather');if(!host)return;
  host.hidden=!weatherEnabled();
  if(host.hidden){host.innerHTML='';return;}
  const renderId=++weatherRenderId,owner=weatherCityKey();
  const active=()=>renderId===weatherRenderId && weatherCityKey()===owner;
  const saved=weatherCity(),city=validWeatherCity(saved)?saved:null;
  host.innerHTML=`<div class="weatherTop"><h2>🌤️ ${city?settingsEscape(city.name):'Météo'}</h2><button class="secondary" id="weatherRefresh" title="Actualiser la météo" aria-label="Actualiser la météo">↻</button></div><div id="weatherForecast" aria-live="polite">${city?'Chargement…':'Ville non réglée. '}</div>${city?'<div class="weatherSource"><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a></div>':'<button class="secondary weatherSetup" id="weatherSetup">Régler la ville</button>'}`;
  document.getElementById('weatherRefresh').onclick=()=>{if(city)weatherCache.delete(`${city.latitude},${city.longitude}`);renderHomeWeather();};
  const setup=document.getElementById('weatherSetup');if(setup)setup.onclick=()=>{openWeatherSettingsOnOpen=true;openSettings();};
  if(!city)return;
  const forecast=document.getElementById('weatherForecast'),key=`${city.latitude},${city.longitude}`;
  try{
    let cached=weatherCache.get(key);
    // Short in-memory cache, invalidated at the selected town's midnight.
    if(cached && (Date.now()-cached.at>900000 || new Intl.DateTimeFormat('sv-SE',{timeZone:cached.data.timezone}).format(new Date())!==cached.data.daily.time[0]))cached=null;
    const data=cached?.data || await weatherFetch('https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:city.latitude,longitude:city.longitude,daily:'temperature_2m_max,temperature_2m_min',hourly:'temperature_2m,weather_code,precipitation_probability,wind_speed_10m',timezone:'auto',forecast_days:'2'}));
    if(!active())return;
    if(!data.daily || data.daily.time?.length!==2)throw Error('Prévisions incomplètes');
    if(!cached)weatherCache.set(key,{at:Date.now(),data});
    forecast.innerHTML=`<div class="weatherDays">${weatherDayHtml(data.daily,0,data.hourly)}${weatherDayHtml(data.daily,1,data.hourly)}</div><p class="weatherSource">Prévisions locales · actualisées à ${new Date(cached?.at || Date.now()).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p>`;
  }catch{if(active())forecast.textContent='Météo indisponible pour le moment. Vérifie ta connexion puis clique sur Actualiser.';}
}
async function searchWeatherCities(query) {
  const data=await weatherFetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:query,count:'6',language:'fr',format:'json'}));
  return (data.results||[]).filter(validWeatherCity);
}
function saveWeatherCity(item,label) {
  if(!validWeatherCity(item))throw Error('Ville invalide.');
  localStorage.setItem(weatherCityKey(),JSON.stringify({name:label,latitude:item.latitude,longitude:item.longitude}));
  weatherCache.clear();renderHomeWeather();
}
