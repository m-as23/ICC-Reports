// Readiness follows the approved sidebar-only shell, independently of networking.
export function isMainTrackShellReady(doc,host){
 return doc?.readyState!=='loading'&&!!host?.MainTrackLocalWork
  &&host.__MainTrackV7Fix===true&&host.__MainTrackV6Integrated===true
  &&['login','form','dashboard','v7FormStatus','v7RefreshLists','v6Toggle'].every(id=>!!doc?.getElementById(id));
}
