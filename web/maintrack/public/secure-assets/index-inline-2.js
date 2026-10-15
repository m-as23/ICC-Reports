
/* Display-only auth enhancements: never store passwords or authentication tokens. */
(function(){
 const code=document.getElementById('lcode'),pass=document.getElementById('lpw'),remember=document.getElementById('mtRememberCode');
 const toggle=document.getElementById('mtTogglePass'),forgot=document.getElementById('mtForgotPw'),go=document.getElementById('lgo');
 if(!code||!pass||!remember||!toggle||!forgot||!go)return;
 const saved=localStorage.getItem('maintrack_pilot_remember_code_v1');
 if(saved){remember.checked=true;code.value=saved;}
 function rememberCode(){try{if(remember.checked&&code.value.trim())localStorage.setItem('maintrack_pilot_remember_code_v1',code.value.trim());else localStorage.removeItem('maintrack_pilot_remember_code_v1');}catch(e){}}
 remember.addEventListener('change',rememberCode);
 go.addEventListener('click',rememberCode);
 toggle.addEventListener('click',function(){const visible=pass.type==='password';pass.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'إخفاء كلمة المرور':'إظهار كلمة المرور');toggle.setAttribute('title',visible?'إخفاء كلمة المرور':'إظهار كلمة المرور');toggle.textContent=visible?'◌':'◉';pass.focus();});
 forgot.addEventListener('click',function(){if(typeof help==='function'&&typeof note==='function'){note('لو نسيت كلمة المرور، اطلب من المسؤول إعادة تعيينها.','err');help('BAD_PW');}else alert('اطلب من المسؤول إعادة تعيين كلمة المرور.');});
 pass.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();go.click();}});
 code.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();pass.focus();}});
})();
