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
  fields.profilePhone.value = 'unsaved'; emit('input','profilePhone');
  emit('focusin','profilePhone');
  fields.profilePhone.value = 'unsaved-more'; emit('input','profilePhone');
  fields.profilePhone.value = 'unsaved'; emit('input','profilePhone');
  assert.equal(tracker.read(),true);
  tracker.begin('updateProfile')({ok:true});
  assert.equal(tracker.read(),false);
});
test('an old acknowledgement never marks newer edits clean; a changed focused value is also detected without input events', () => {
  const {tracker,fields,emit} = setup();
  emit('focusin','profilePreferred');
  fields.profilePreferred.value = 'first edit'; emit('input','profilePreferred');
  const acknowledge = tracker.begin('updateProfile');
  fields.profilePreferred.value = 'newer edit'; emit('input','profilePreferred');
  acknowledge({ok:true}); assert.equal(tracker.read(),true);
  fields.profilePreferred.value = ''; emit('input','profilePreferred'); assert.equal(tracker.read(),false);
  fields.profilePreferred.value = 'programmatic change'; assert.equal(tracker.read(),true);
});
