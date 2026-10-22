// Same outlined SVG language as the approved V9 reference. Static trusted paths only.
const paths={
 search:'<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 5 5"/>',
 box:'<path d="m12 3 9 5v8l-9 5-9-5V8zM3 8l9 5 9-5M12 13v8M7 5.8l9 5"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
 id:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 9h4M7 13h10M7 17h7"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
 history:'<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7M12 7v5l3 2"/>',
 sensors:'<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
 drives:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m13 7-3 5h4l-3 5M8 5h8"/>',
 bearings:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5m0 8v5M3 12h5m8 0h5"/>',
 motors:'<path d="M4 7h14v12H4zM18 10h4v6h-4M7 7V4h8v3M7 19v2m8-2v2M7 10v6m4-6v6m4-6v6"/>',
 buttons:'<circle cx="12" cy="9" r="6"/><path d="M8 15v6h8v-6M12 6v6"/>',
 heaters:'<path d="M6 3c-5 5 5 5 0 10s5 5 0 8M12 3c-5 5 5 5 0 10s5 5 0 8M18 3c-5 5 5 5 0 10s5 5 0 8"/>',
 contactors:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8v8m4-8v8m4-8v8M8 1v3m8-3v3M8 20v3m8-3v3"/>',
 chemicals:'<path d="M9 3h6m-5 0v6l-6 10c-.5 1 .1 2 1 2h14c.9 0 1.5-1 1-2L14 9V3M7 15h10"/>'
};
export function icon(name){const span=document.createElement('span');span.innerHTML='<svg class="icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.box)+'</svg>';return span.firstChild;}
