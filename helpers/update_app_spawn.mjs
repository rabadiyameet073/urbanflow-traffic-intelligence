import fs from 'node:fs';

let s = fs.readFileSync('packages/web/src/ui/app.ts', 'utf8');

// 1. In buildTestControlsPanel, update spawnVisibleBtn
const oldSpawnVisible = `  const spawnVisibleBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { id: 'btn-test-spawn-visible', type: 'button' },
      on: {
        click: () => {
          const count = getCount();
          if (selectedVehicle === 'AMBULANCE') {
            void store.requestPreemption(selectedLane);
            feedbackText.textContent = \`🚑 Emergency Ambulance dispatched on \${selectedLane} (EVP Preemption Active)\`;
          } else {
            store.spawnVehicle(selectedLane, selectedVehicle, count, 45);
            feedbackText.textContent = \`✨ Injected \${count} × \${selectedVehicle} into \${selectedLane} at 45m upstream\`;
          }
        },
      },
    },
    ['⚡ Spawn in Approach (Visible 45m)'],
  );`;

const newSpawnVisible = `  const spawnVisibleBtn = h(
    'button',
    {
      class: 'btn btn-primary',
      attrs: { id: 'btn-test-spawn-visible', type: 'button' },
      on: {
        click: () => {
          const count = getCount();
          store.spawnVehicle(selectedLane, selectedVehicle, count, 45);
          feedbackText.textContent = selectedVehicle === 'AMBULANCE'
            ? \`🚑 Emergency Ambulance injected into \${selectedLane} at 45m (Immediate Green Clearance!)\`
            : \`✨ Injected \${count} × \${selectedVehicle} into \${selectedLane} at 45m approach (Immediate!)\`;
        },
      },
    },
    ['⚡ Spawn in Approach (Visible 45m)'],
  );`;

s = s.replace(oldSpawnVisible, newSpawnVisible);
if (!s.includes('Immediate Green Clearance!')) {
  s = s.replace(oldSpawnVisible.replace(/\n/g, '\r\n'), newSpawnVisible.replace(/\n/g, '\r\n'));
}

// 2. Update emergencyPreemptBtn
s = s.replace(
  "void store.requestPreemption(selectedLane);",
  "void store.requestPreemption(selectedLane, 45);"
);

// 3. Update buildLaneRow to add quick vehicle spawn buttons on every lane row!
const oldControls = `      h('div', { class: 'density-lane-controls' }, [
        decBtn,
        slider,
        incBtn,
      ]),`;

const newControls = `      h('div', { class: 'density-lane-controls' }, [
        decBtn,
        slider,
        incBtn,
        h('button', {
          class: 'btn btn-secondary btn-xs',
          attrs: { type: 'button', 'aria-label': \`Spawn car immediately on \${lane}\` },
          on: {
            click: () => {
              updateLaneChips(lane);
              store.spawnVehicle(lane, 'CAR', 1, 45);
              feedbackText.textContent = \`⚡ Car spawned on \${lane} at 45m approach\`;
            },
          },
        }, ['+ 🚗 Car']),
        h('button', {
          class: 'btn btn-danger btn-xs',
          attrs: { type: 'button', 'aria-label': \`Spawn ambulance immediately on \${lane}\` },
          on: {
            click: () => {
              updateLaneChips(lane);
              store.spawnVehicle(lane, 'AMBULANCE', 1, 45);
              feedbackText.textContent = \`⚡ Immediate Ambulance on \${lane} at 45m (Signal clearing to Green!)\`;
            },
          },
        }, ['⚡ 🚑 EMS']),
      ]),`;

s = s.replace(oldControls, newControls);
if (!s.includes("['⚡ 🚑 EMS']")) {
  s = s.replace(oldControls.replace(/\n/g, '\r\n'), newControls.replace(/\n/g, '\r\n'));
}

// 4. Update spawnAmbulance in app.ts
const oldSpawnAmbulance = `async function spawnAmbulance(): Promise<void> {
  const decision = await store.requestPreemption('NB-TR');
  const feedback = maybeById('proposal-feedback');
  if (feedback) {
    feedback.textContent =
      decision.decision === 'accepted'
        ? \`EVP accepted for \${decision.id}.\`
        : \`EVP rejected: \${decision.reason ?? 'UNKNOWN'}.\`;
  }
}`;

const newSpawnAmbulance = `async function spawnAmbulance(): Promise<void> {
  const lane = store.selectedLane.get();
  const decision = await store.requestPreemption(lane, 45);
  const feedback = maybeById('proposal-feedback');
  const testFeedback = maybeById('test-feedback-msg');
  const msg = decision.decision === 'accepted'
    ? \`🚑 Ambulance spawned immediately on \${lane} at 45m (EVP active, signal turning green!)\`
    : \`EVP rejected: \${decision.reason ?? 'UNKNOWN'}.\`;
  if (feedback) feedback.textContent = msg;
  if (testFeedback) testFeedback.textContent = msg;
}`;

s = s.replace(oldSpawnAmbulance, newSpawnAmbulance);
if (!s.includes('store.selectedLane.get()')) {
  s = s.replace(oldSpawnAmbulance.replace(/\n/g, '\r\n'), newSpawnAmbulance.replace(/\n/g, '\r\n'));
}

// 5. Update buildLaneTable
s = s.replace(
  "on: { click: () => store.spawnVehicle(lane, 'CAR') }",
  "on: { click: () => store.spawnVehicle(lane, 'CAR', 1, 45) }"
);

s = s.replace(
  "on: { click: () => store.spawnVehicle(lane, 'AMBULANCE') }",
  "on: { click: () => store.spawnVehicle(lane, 'AMBULANCE', 1, 45) }"
);

fs.writeFileSync('packages/web/src/ui/app.ts', s, 'utf8');
console.log('app.ts updated successfully');

