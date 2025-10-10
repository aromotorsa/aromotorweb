(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))x(r);new MutationObserver(r=>{for(const c of r)if(c.type==="childList")for(const p of c.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&x(p)}).observe(document,{childList:!0,subtree:!0});function f(r){const c={};return r.integrity&&(c.integrity=r.integrity),r.referrerPolicy&&(c.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?c.credentials="include":r.crossOrigin==="anonymous"?c.credentials="omit":c.credentials="same-origin",c}function x(r){if(r.ep)return;r.ep=!0;const c=f(r);fetch(r.href,c)}})();document.addEventListener("DOMContentLoaded",()=>{const y=document.getElementById("search-box"),i=document.getElementById("category-filter"),f=document.getElementById("subcategory-filter"),x=document.getElementById("clear-filters"),r=document.getElementById("product-grid"),c=document.getElementById("results-count"),p=document.getElementById("no-results"),T=document.getElementById("loading-spinner"),q=document.getElementById("cart-button"),k=document.getElementById("cart-count"),h=document.getElementById("cart-modal-overlay"),F=document.getElementById("close-cart-modal-button"),L=document.getElementById("cart-items-container"),M=document.getElementById("cart-total"),j=document.getElementById("share-whatsapp-button"),R=document.getElementById("clear-cart-button"),m=document.getElementById("client-name-input"),H=document.getElementById("save-cart-button"),D=document.getElementById("saved-orders-button"),$=document.getElementById("saved-orders-modal-overlay"),J=document.getElementById("close-saved-orders-modal-button"),C=document.getElementById("saved-orders-container"),W=document.getElementById("view-toggle");let g=[],n=[],E="grid",d=JSON.parse(localStorage.getItem("savedCarts"))||[];async function Q(){try{const t=await fetch("Resultado_Final.json");if(!t.ok)throw new Error(`HTTP error! status: ${t.status}`);g=await t.json(),G(),l()}catch(t){console.error("Error al cargar productos:",t),r.innerHTML='<p class="col-span-full text-center text-red-600 font-bold">Error: No se pudo cargar el catálogo.</p>'}finally{T.style.display="none"}}function G(){const t=[...new Set(g.map(e=>e.Categoría))].sort();i.innerHTML='<option value="">Todas las Categorías</option>',t.forEach(e=>{const a=document.createElement("option");a.value=e,a.textContent=e,i.appendChild(a)})}function A(){const t=i.value;f.innerHTML='<option value="">Todas las Subcategorías</option>',t&&[...new Set(g.filter(a=>a.Categoría===t&&a.Subcategoría).map(a=>a.Subcategoría))].sort().forEach(a=>{const o=document.createElement("option");o.value=a,o.textContent=a,f.appendChild(o)}),l()}function l(){const t=y.value.toLowerCase(),e=i.value,a=f.value,o=g.filter(s=>{var v,b,u;return(t===""||((v=s.Nombre)==null?void 0:v.toLowerCase().includes(t))||((b=s["Referencia Interna"])==null?void 0:b.toLowerCase().includes(t))||((u=s.Marca)==null?void 0:u.toLowerCase().includes(t)))&&(e===""||s.Categoría===e)&&(a===""||s.Subcategoría===a)});r.innerHTML="",E==="grid"?r.className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6":r.className="flex flex-col gap-3",p.classList.toggle("hidden",o.length>0),c.textContent=`${o.length} producto(s)`,o.forEach(s=>r.appendChild(S(s)))}function S(t){const e=document.createElement("div"),a=t["Referencia Interna"],o=t.Precio?"$"+parseFloat(t.Precio).toFixed(2):"N/A",s=t.Stock||0,v=`images/${a}.webp`,b=n.find(Z=>Z.ref===a),u=b?b.quantity:0,O=s>10?'<span class="w-3 h-3 bg-green-500 rounded-full"></span>':s>0?'<span class="w-3 h-3 bg-yellow-500 rounded-full"></span>':'<span class="w-3 h-3 bg-red-500 rounded-full"></span>';let B="";return E==="grid"?(e.className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col transition-transform transform hover:-translate-y-1",B=`
                        <div class="h-40 bg-gray-200 flex items-center justify-center">
                            <img src="${v}" alt="${t.Nombre}" class="w-full h-full object-cover" loading="lazy" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';">
                        </div>
                        <div class="p-3 flex-grow flex flex-col text-sm">
                            <h3 class="font-bold text-gray-800 flex-grow">${t.Nombre||"Sin Nombre"}</h3>
                            <p class="text-xs text-gray-500 mt-1">${a||""}</p>
                            <p class="text-xs text-white bg-red-600 px-2 py-1 rounded-full self-start mt-2">${t.Categoría||""}</p>
                            <div class="mt-3 pt-3 border-t flex justify-between items-center">
                                <div class="flex items-center gap-1">${O} <p class="font-bold">${s}</p></div>
                                <p class="font-bold text-md text-red-700">${o}</p>
                            </div>
                        </div>
                        <div class="flex relative">
                            ${u>0?`<span class="absolute top-[-10px] right-[-5px] bg-blue-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${u}</span>`:""}
                            <button class="copy-button w-3/4 bg-gray-200 text-gray-700 text-xs py-2 hover:bg-red-600 hover:text-white transition-colors" data-info="Producto: ${t.Nombre||""}
Ref: ${a||""}
Precio: ${o}"><i class="fas fa-copy mr-1"></i> Copiar</button>
                            <button class="add-to-cart-button w-1/4 bg-red-600 text-white text-lg hover:bg-red-700 transition-colors" data-ref="${a}"><i class="fas fa-plus"></i></button>
                        </div>
                    `):(e.className="bg-white rounded-lg shadow-md overflow-hidden flex items-center p-3 gap-4 w-full",B=`
                        <img src="${v}" alt="${t.Nombre}" class="w-20 h-20 object-cover bg-gray-200 rounded-md" loading="lazy" onerror="this.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';">
                        <div class="flex-grow">
                            <h3 class="font-bold text-gray-800">${t.Nombre||"Sin Nombre"}</h3>
                            <p class="text-sm text-gray-500">${a||""}</p>
                            <div class="flex items-center gap-4 mt-1">
                                <p class="text-sm text-white bg-red-600 px-2 py-1 rounded-full">${t.Categoría||""}</p>
                                <div class="flex items-center gap-1">${O} <p class="font-bold">${s}</p></div>
                            </div>
                        </div>
                        <div class="flex flex-col items-end gap-2">
                            <p class="font-bold text-lg text-red-700">${o}</p>
                            <div class="flex relative">
                                ${u>0?`<span class="absolute top-[-10px] right-[-5px] bg-blue-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">${u}</span>`:""}
                                <button class="copy-button p-2 bg-gray-200 text-gray-700 rounded-l-md hover:bg-red-600 hover:text-white transition-colors" data-info="Producto: ${t.Nombre||""}
Ref: ${a||""}
Precio: ${o}"><i class="fas fa-copy"></i></button>
                                <button class="add-to-cart-button p-2 bg-red-600 text-white rounded-r-md hover:bg-red-700 transition-colors" data-ref="${a}"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                    `),e.innerHTML=B,e.dataset.ref=a,e}function N(t){const e=document.querySelector(`[data-ref="${t}"]`);if(e){const a=g.find(o=>o["Referencia Interna"]===t);if(a){const o=S(a);e.replaceWith(o)}}}function z(t,e){const a=n.find(o=>o.ref===t);if(a)a.quantity++;else{const o=g.find(s=>s["Referencia Interna"]===t);o&&n.push({ref:t,quantity:1,product:o})}if(w(),N(t),I("cart-notification"),e){const o=e.querySelector("i");e.classList.remove("bg-red-600"),e.classList.add("bg-green-500"),o.classList.remove("fa-plus"),o.classList.add("fa-check"),setTimeout(()=>{e.classList.add("bg-red-600"),e.classList.remove("bg-green-500"),o.classList.add("fa-plus"),o.classList.remove("fa-check")},1e3)}}function _(t,e){const a=n.find(o=>o.ref===t);a&&(a.quantity+=e,a.quantity<=0&&(n=n.filter(o=>o.ref!==t))),w(),N(t)}function w(){K();const t=n.reduce((a,o)=>a+o.quantity,0);k.textContent=t;const e=n.reduce((a,o)=>a+(parseFloat(o.product.Precio)||0)*o.quantity,0);M.textContent=`$${e.toFixed(2)}`}function K(){if(n.length===0){L.innerHTML='<p class="text-gray-500">Tu carrito está vacío.</p>';return}L.innerHTML=n.map(t=>`
                    <div class="flex items-center justify-between border-b py-2 gap-2">
                        <div class="flex-grow min-w-0">
                            <p class="font-bold truncate">${t.product.Nombre}</p>
                            <p class="text-sm text-gray-500">${t.product["Referencia Interna"]}</p>
                            <p class="text-sm font-semibold text-red-600">$${(parseFloat(t.product.Precio)||0).toFixed(2)}</p>
                        </div>
                        <div class="flex items-center gap-2 flex-shrink-0">
                            <button class="change-quantity-button bg-gray-200 w-7 h-7 rounded" data-ref="${t.ref}" data-change="-1">-</button>
                            <span>${t.quantity}</span>
                            <button class="change-quantity-button bg-gray-200 w-7 h-7 rounded" data-ref="${t.ref}" data-change="1">+</button>
                        </div>
                    </div>
                `).join("")}function U(){if(n.length===0)return;let t=`*¡Hola! Te comparto este pedido:*

`;m.value&&(t=`*Pedido para: ${m.value}*

`);let e=0;n.forEach(a=>{const o=parseFloat(a.product.Precio)||0,s=o*a.quantity;e+=s,t+=`*${a.product.Nombre}*
`,t+=`Ref: ${a.ref}
`,t+=`${a.quantity} x $${o.toFixed(2)} = *$${s.toFixed(2)}*

`}),t+=`*TOTAL DEL PEDIDO: $${e.toFixed(2)}*`,window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(t)}`,"_blank")}function V(){const t=m.value.trim();if(n.length===0){alert("El carrito está vacío.");return}if(!t){alert("Por favor, ingresa un nombre de cliente para guardar el pedido.");return}const e={id:Date.now(),clientName:t,items:JSON.parse(JSON.stringify(n)),total:n.reduce((a,o)=>a+(parseFloat(o.product.Precio)||0)*o.quantity,0)};d.push(e),localStorage.setItem("savedCarts",JSON.stringify(d)),m.value="",h.classList.remove("flex"),I("saved-notification")}function P(){if(d.length===0){C.innerHTML='<p class="text-gray-500">No hay pedidos guardados.</p>';return}C.innerHTML=d.map(t=>`
                    <div class="flex items-center justify-between border-b py-3 gap-2">
                        <div class="flex-grow min-w-0">
                            <p class="font-bold truncate">${t.clientName}</p>
                            <p class="text-sm text-gray-500">${t.items.length} tipo(s) de producto</p>
                            <p class="text-sm font-semibold text-red-600">$${t.total.toFixed(2)}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="load-cart-button bg-green-500 text-white py-1 px-3 rounded hover:bg-green-600" data-id="${t.id}">Cargar</button>
                            <button class="delete-cart-button bg-red-600 text-white py-1 px-3 rounded hover:bg-red-700" data-id="${t.id}">Borrar</button>
                        </div>
                    </div>
                `).join("")}function X(t){const e=d.find(a=>a.id==t);e&&(n=JSON.parse(JSON.stringify(e.items)),m.value=e.clientName,w(),l(),$.classList.remove("flex"),h.classList.add("flex"))}function Y(t){confirm("¿Estás seguro de que quieres borrar este pedido guardado?")&&(d=d.filter(e=>e.id!=t),localStorage.setItem("savedCarts",JSON.stringify(d)),P())}function I(t){const e=document.getElementById(t);e.classList.remove("opacity-0","translate-y-2"),e.classList.add("opacity-100","translate-y-0"),setTimeout(()=>{e.classList.add("opacity-0","translate-y-2"),e.classList.remove("opacity-100","translate-y-0")},2e3)}y.addEventListener("input",l),i.addEventListener("change",A),f.addEventListener("change",l),x.addEventListener("click",()=>{y.value="",i.value="",A()}),r.addEventListener("click",function(t){const e=t.target.closest(".copy-button");e&&navigator.clipboard.writeText(e.dataset.info).then(()=>I("copy-notification"));const a=t.target.closest(".add-to-cart-button");a&&z(a.dataset.ref,a)}),q.addEventListener("click",()=>h.classList.add("flex")),F.addEventListener("click",()=>h.classList.remove("flex")),R.addEventListener("click",()=>{n=[],w(),l()}),j.addEventListener("click",U),L.addEventListener("click",t=>{const e=t.target.closest(".change-quantity-button");e&&_(e.dataset.ref,parseInt(e.dataset.change,10))}),H.addEventListener("click",V),D.addEventListener("click",()=>{P(),$.classList.add("flex")}),J.addEventListener("click",()=>$.classList.remove("flex")),C.addEventListener("click",t=>{t.target.closest(".load-cart-button")&&X(t.target.closest(".load-cart-button").dataset.id),t.target.closest(".delete-cart-button")&&Y(t.target.closest(".delete-cart-button").dataset.id)}),W.addEventListener("click",t=>{const e=t.target.closest(".view-btn");e&&!e.classList.contains("text-red-600")&&(E=e.dataset.view,document.querySelectorAll(".view-btn").forEach(a=>a.classList.remove("text-red-600")),document.querySelectorAll(".view-btn").forEach(a=>a.classList.add("text-gray-400")),e.classList.add("text-red-600"),e.classList.remove("text-gray-400"),l())}),"serviceWorker"in navigator&&window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").then(t=>console.log("Service Worker registrado con éxito.",t)).catch(t=>console.error("Error registrando Service Worker",t))}),Q()});
