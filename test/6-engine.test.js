const test=require('node:test'),assert=require('node:assert/strict'),E=require('../src/engine.js');
const boq=[{code:'A1',desc:'Ceramic',unit:'m2',qty:1000,rate:500,discipline:'Finishes'},{code:'A2',desc:'Paint',unit:'m2',qty:200,rate:100,discipline:'Finishes'}];
const pk=t=>({contract:{type:t,markupPct:30},boq,changes:[]});
test('full omission uses BOQ qty, negative, both contracts',()=>{for(const t of['Lump Sum','Re-measured']){const l=E.computeLine({action:'Omission',scope:'full',boqCode:'A1',takeoffQty:700},pk(t));assert.equal(l.qty,1000);assert.equal(l.amount,-500000)}});
test('partial omission uses actual take-off',()=>{const l=E.computeLine({action:'Omission',scope:'partial',boqCode:'A1',takeoffQty:300},pk('Lump Sum'));assert.equal(l.qty,300);assert.equal(l.amount,-150000)});
test('partial omission above BOQ flags',()=>{const l=E.computeLine({action:'Omission',scope:'partial',boqCode:'A2',takeoffQty:250},pk('Re-measured'));assert.equal(l.qty,250);assert.ok(l.flags.some(f=>f.level==='warn'))});
test('lump sum full replacement adds at fixed BOQ qty',()=>{const l=E.computeLine({action:'Addition',replacesCode:'A1',takeoffQty:930,unit:'m2',rateSource:'Manual',rate:800},pk('Lump Sum'));assert.equal(l.qty,1000);assert.equal(l.amount,800000)});
test('re-measured new item adds at actual take-off',()=>{const l=E.computeLine({action:'Addition',replacesCode:'A1',takeoffQty:930,unit:'m2',rateSource:'Manual',rate:800},pk('Re-measured'));assert.equal(l.qty,930);assert.equal(l.amount,744000)});
test('lump sum addition with no replaced item uses take-off',()=>{assert.equal(E.computeLine({action:'Addition',takeoffQty:50,rateSource:'Manual',rate:10},pk('Lump Sum')).qty,50)});
test('net is the sum, omission negative plus addition positive',()=>{const p=pk('Lump Sum');const c=E.computeChange({lines:[{id:'1',action:'Omission',scope:'full',boqCode:'A1'},{id:'2',action:'Addition',replacesCode:'A1',unit:'m2',rateSource:'Manual',rate:800}]},p);assert.equal(c.omissions,-500000);assert.equal(c.additions,800000);assert.equal(c.net,300000)});
test('new rate applies one OH&P markup on supply and install',()=>{const r=E.rateFor({rateSource:'New',breakdown:[{qty:1,rate:100},{qty:1,rate:50}]},pk('Lump Sum'));assert.equal(r.rate,195)});
test('derived rate takes no extra markup',()=>{assert.equal(E.rateFor({rateSource:'Derived',rateRef:'A2',factor:2},pk('Lump Sum')).rate,200)});
test('Design and Build follows lump sum',()=>{assert.equal(E.computeLine({action:'Addition',replacesCode:'A1',takeoffQty:930,unit:'m2',rateSource:'Manual',rate:800},pk('Design & Build')).qty,1000)});
test('imported change without lines uses stage amount, VO approved wins',()=>{const p=pk('Lump Sum');assert.equal(E.changeValue({lines:[],stages:[{kind:'CR',amount:50}]},p).value,50);assert.equal(E.changeValue({lines:[],stages:[{kind:'CR',amount:50},{kind:'VO',status:'Approved',amount:60,approved:45}]},p).value,45)});
test('derived rate',()=>{assert.equal(E.rateFor({rateSource:'Derived',rateRef:'A1',factor:1.2},pk('Lump Sum')).rate,600)});
test('abortive adds back executed qty only when confirmed',()=>{const p=pk('Lump Sum');const lines=[{id:'1',action:'Omission',scope:'full',boqCode:'A2',executedQty:50}];assert.equal(E.computeChange({lines,abortive:{status:'Yes'}},p).net,-15000);assert.equal(E.computeChange({lines,abortive:{status:'No'}},p).net,-20000)});
test('chain requires a reason when amount moves',()=>{assert.equal(E.chainChecks({stages:[{kind:'DCR',amount:100},{kind:'CR',amount:120}]}).length,1);assert.equal(E.chainChecks({stages:[{kind:'DCR',amount:100},{kind:'CR',amount:120,deltaReason:'x'}]}).length,0)});
test('approved VO overrides assessment; cancelled is zero',()=>{const p=pk('Lump Sum');const lines=[{id:'1',action:'Omission',scope:'full',boqCode:'A2'}];assert.equal(E.changeValue({lines,stages:[{kind:'VO',status:'Approved',approved:-19000}]},p).value,-19000);assert.equal(E.changeValue({lines,stages:[{kind:'CR',status:'Cancelled'}]},p).value,0)});
test('package over-omission across changes',()=>{const p=pk('Lump Sum');p.changes=[{id:'CE1',lines:[{id:'1',action:'Omission',scope:'partial',boqCode:'A2',takeoffQty:150}]},{id:'CE2',lines:[{id:'2',action:'Omission',scope:'partial',boqCode:'A2',takeoffQty:100}]}];assert.equal(E.boqOveromissions(p).length,1)});
test('take-off comparison',()=>{const r=E.compareTakeoff([{code:'A1',originalQty:1200,revisedQty:0},{code:'A2',originalQty:200,revisedQty:260},{code:'Z',originalQty:1,revisedQty:1}],pk('Lump Sum'));assert.equal(r[0].scope,'full');assert.equal(r[0].flags.length,1);assert.equal(r[1].action,'Addition');assert.equal(r[2].action,null);assert.equal(r[2].flags.length,1)});
test('risk allowance applies only to new-rate additions',()=>{const p=pk('Lump Sum');p.contract.riskPct=10;const c=E.computeChange({lines:[{id:'1',action:'Omission',scope:'partial',boqCode:'A1',takeoffQty:10},{id:'2',action:'Addition',takeoffQty:10,rateSource:'Manual',rate:100}]},p);assert.equal(c.risk,0);assert.equal(c.net,-4000)});
test('per type quantities multiply by number of each type',()=>{const p=pk('Lump Sum');const c=E.computeChange({types:[{name:'A',count:10}],lines:[{id:'1',action:'Addition',perType:{A:5},rateSource:'Manual',rate:100}]},p);assert.equal(c.net,5000)});
test('AI reply parser tolerates surrounding text',()=>{assert.equal(E.parseAiJson('Here:\n```json\n{"a":1}\n```').a,1)});

// OH&P/risk only on built-up new rates; BOQ and pro-rata are all-in.
test('pro-rata rate is used as-is, no markup', () => {
  const pkg = { contract: { type: 'Lump Sum', markupPct: 30, riskPct: 10 }, boq: [{ code: 'A-1', desc: 'Base item', unit: 'm2', qty: 100, rate: 5000 }] };
  const line = { id: 'l1', action: 'Addition', desc: 'Similar item', unit: 'm2', scope: 'partial', takeoffQty: 10, rateSource: 'Similar', rateRef: 'A-1', rate: 3869 };
  const c = E.computeLine(line, pkg, { types: [] });
  assert.equal(c.rate, 3869);
  assert.match(c.rateBasis, /pro-rata/);
});

test('similar without a stored rate falls back to the raw BOQ rate', () => {
  const pkg = { contract: { type: 'Lump Sum', markupPct: 30, riskPct: 10 }, boq: [{ code: 'A-1', desc: 'Base item', unit: 'm2', qty: 100, rate: 5000 }] };
  const c = E.computeLine({ id: 'l1', action: 'Addition', unit: 'm2', scope: 'partial', takeoffQty: 10, rateSource: 'Similar', rateRef: 'A-1' }, pkg, { types: [] });
  assert.equal(c.rate, 5000);
});

test('risk allowance applies only to new-rate additions', () => {
  const pkg = { contract: { type: 'Lump Sum', markupPct: 30, riskPct: 10 }, boq: [{ code: 'A-1', desc: 'Base item', unit: 'm2', qty: 100, rate: 5000 }] };
  const change = { types: [], lines: [
    { id: 'a', action: 'Addition', unit: 'm2', scope: 'partial', takeoffQty: 10, rateSource: 'BOQ', rateRef: 'A-1' },
    { id: 'b', action: 'Addition', unit: 'm2', scope: 'partial', takeoffQty: 10, rateSource: 'Similar', rateRef: 'A-1', rate: 3869 },
    { id: 'c', action: 'Addition', unit: 'm2', scope: 'partial', takeoffQty: 10, rateSource: 'New', breakdown: [{ cat: 'Supply', item: 'x', unit: 'm2', qty: 1, rate: 1000 }] },
  ] };
  const calc = E.computeChange(change, pkg);
  // new-rate line: 1000 * 1.30 = 1300/m2 -> 13,000. risk = 10% of 13,000 only.
  assert.equal(calc.additions, 10 * 5000 + 10 * 3869 + 13000);
  assert.equal(calc.risk, 1300);
  assert.equal(calc.net, calc.omissions + calc.additions + calc.abortiveTotal + calc.risk);
});

test('new built-up rate still carries OH&P', () => {
  const pkg = { contract: { type: 'Lump Sum', markupPct: 30, riskPct: 10 }, boq: [] };
  const c = E.computeLine({ id: 'n', action: 'Addition', unit: 'm2', scope: 'partial', takeoffQty: 2, rateSource: 'New', breakdown: [{ cat: 'Supply', item: 'x', unit: 'm2', qty: 1, rate: 1000 }] }, pkg, { types: [] });
  assert.equal(c.rate, 1300);
});
