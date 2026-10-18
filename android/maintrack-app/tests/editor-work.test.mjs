import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorWork, EDITOR_GROUPS} from '../update-system/editor-work.mjs';
function setup() {
  const fields = Object.fromEntries(Object.values(EDITOR_GROUPS).flat().map(id => [id,{id,value:'',type:'text'}]));
  fields.v6Editor = {hidden:true}; fields.v6Temp = {hidden:true};
  const listeners = new Map();
  const document = {getElementById:id => fields[id], addEventListener:(event,fn) => listeners.set(event,fn)};
  const tracker = createEditorWork(document);
  return {tracker, fields, emit:(event,id) => listeners.get(event)({target:fields[id]})};
}
test('an edit with an unknown baseline cannot become clean just by refocusing', () => {
  const {tracker,fields,emit} = setup();
  fields.otReason.value = 'unsaved'; emit('input','otReason');
  emit('focusin','otReason');
  fields.otReason.value = 'unsaved-more'; emit('input','otReason');
  fields.otReason.value = 'unsaved'; emit('input','otReason');
  assert.equal(tracker.read(),true);
  tracker.begin('overtimeRequest')({ok:true});
  assert.equal(tracker.read(),false);
});
test('an old acknowledgement never marks newer edits clean; a changed focused value is also detected without input events', () => {
  const {tracker,fields,emit} = setup();
  emit('focusin','otReason');
  fields.otReason.value = 'first edit'; emit('input','otReason');
  const acknowledge = tracker.begin('overtimeRequest');
  fields.otReason.value = 'newer edit'; emit('input','otReason');
  acknowledge({ok:true}); assert.equal(tracker.read(),true);
  fields.otReason.value = ''; emit('input','otReason'); assert.equal(tracker.read(),false);
  fields.otReason.value = 'programmatic change'; assert.equal(tracker.read(),true);
});
