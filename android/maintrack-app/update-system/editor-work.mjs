// In-memory dirtiness only. No draft, password, token, or profile is persisted.
// Report fields use a separate value-based reader; search/filter controls are not edits.
export const EDITOR_GROUPS = Object.freeze({
  login: ['lcode','lpw'],
  password: ['op','np','np2'],
  // Profile is read-only in the unified account experience.
  leave: ['leaveType','leaveStart','leaveEnd','leaveDuration','leaveReason'],
  overtime: ['otDate','otFromHour','otFromMinute','otFromPeriod',
    'otToHour','otToMinute','otToPeriod','otWorkKind','otKind','otReason'],
  admin: ['adminDepartment','adminJob','adminRole','adminActive','adminLeave'],
  employee: ['v6EmpCode','v6EmpName','v6EmpRole'],
  catalog: ['v6CatName','v6Parent'],
  workOrder: ['v6Desc','v6Solution','v6Spare','v6Status','v6Category','v6Reason']
});
const actionGroup = {login:'login', changePassword:'password', change:'password',
  updateProfile:'', leaveRequest:'leave', overtimeRequest:'overtime', adminSaveUser:'admin',
  adminCreateEmployee:'employee', adminResetEmployeePassword:'employee',
  adminCatalogSave:'catalog', cmmsWrite:'workOrder'};
const valueOf = field => field.type === 'checkbox' ? field.checked : field.value;

export function createEditorWork(document) {
  const ids = new Set(Object.values(EDITOR_GROUPS).flat());
  const baselines = new Map(), dirty = new Set();
  const remember = event => {
    const field = event.target;
    // An edit without a known baseline stays dirty until an acknowledgement or
    // explicit discard. Refocusing must not turn that unsaved value into a baseline.
    if (ids.has(field?.id) && !baselines.has(field.id) && !dirty.has(field.id)) baselines.set(field.id, valueOf(field));
  };
  const changed = event => {
    const field = event.target;
    if (!ids.has(field?.id)) return;
    if (!baselines.has(field.id) || valueOf(field) !== baselines.get(field.id)) dirty.add(field.id);
    else dirty.delete(field.id);
  };
  for (const name of ['focusin','pointerdown','keydown','beforeinput']) document.addEventListener(name, remember, true);
  for (const name of ['input','change']) document.addEventListener(name, changed, true);
  const forget = id => {baselines.delete(id); dirty.delete(id);};
  document.addEventListener('click', event => {
    if (event.target.closest?.('#v6Cancel')) EDITOR_GROUPS.workOrder.forEach(forget);
  });
  return Object.freeze({
    read() {
      if ([...ids].some(id => !document.getElementById(id))) return true;
      if (!document.getElementById('v6Editor')?.hidden || !document.getElementById('v6Temp')?.hidden) return true;
      return dirty.size > 0 || [...baselines].some(([id, value]) => valueOf(document.getElementById(id)) !== value);
    },
    begin(action) {
      const fields = EDITOR_GROUPS[actionGroup[action]] || [];
      // Do not acknowledge any newer edits made while the request was in flight.
      const sent = fields.map(id => [id, valueOf(document.getElementById(id))]);
      return response => {
        if (!response || response.error) return;
        for (const [id, value] of sent) if (valueOf(document.getElementById(id)) === value) forget(id);
      };
    }
  });
}
