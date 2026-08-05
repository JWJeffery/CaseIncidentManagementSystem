function value(state, id, safe) {
  return safe(state.card[id] || '');
}

function input(state, id, safe) {
  return `<input data-card="${id}" value="${value(state, id, safe)}">`;
}

function reunificationIcon() {
  return `<img class="srm-icon-svg" src="src/srm-icon.svg" alt="Adult and child reunification icon">`;
}

export function renderSrmCard(state, t, safe) {
  return `<div class="srm-card">
    <section class="srm-top-panel">
      <div class="srm-icon" aria-hidden="true">${reunificationIcon()}</div>
      <header class="srm-title">
        <div>
          <h2>${safe(t[0])}</h2>
          <p>Please complete and have photo identification ready to show school district personnel.</p>
        </div>
        <b>PLEASE PRINT CLEARLY</b>
      </header>

      <div class="srm-line srm-student-row">
        <label>${safe(t[1])}</label>${input(state, 'student', safe)}
        <label>${safe(t[4])}</label>${input(state, 'grade', safe)}
      </div>
      <div class="srm-line srm-teacher-row">
        <label>${safe(t[2])}</label>${input(state, 'teacher', safe)}
        <label>${safe(t[3])}</label>${input(state, 'pickup', safe)}
      </div>
      <div class="srm-line">
        <label>${safe(t[5])}</label>${input(state, 'relation', safe)}
      </div>
      <div class="srm-line">
        <label>${safe(t[6])}</label>${input(state, 'signature', safe)}
      </div>

      <p class="srm-staff-note">${safe(t[7])}</p>
      <div class="srm-line srm-staff-row">
        <label>${safe(t[8])}</label>${input(state, 'proof', safe)}
        <label>${safe(t[9])}</label>${input(state, 'confirmed', safe)}
        <label>${safe(t[10])}</label>${input(state, 'datetime', safe)}
      </div>
      <div class="srm-line srm-personnel-signature">
        <label>${safe(t[11])}</label>${input(state, 'staffsig', safe)}
      </div>
    </section>

    <p class="srm-send-note">${safe(t[12])}</p>
    <div class="srm-perforation"></div>

    <section class="srm-release-stub">
      <p class="srm-release-note">To be completed by school personnel. Separate at perforation, and send bottom section with parent/guardian to Release Area.</p>
      <div class="srm-release-grid">
        <div class="srm-line release-student"><label>${safe(t[1])}</label>${input(state, 'releaseStudent', safe)}</div>
        <div class="srm-line release-grade"><label>${safe(t[4])}</label>${input(state, 'releaseGrade', safe)}</div>
        <div class="srm-line release-teacher"><label>${safe(t[2])}</label>${input(state, 'releaseTeacher', safe)}</div>
        <div class="srm-line release-person"><label>${safe(t[13])}</label>${input(state, 'releasePerson', safe)}</div>
        <div class="srm-line release-signature"><label>${safe(t[6])}</label>${input(state, 'releaseSignature', safe)}</div>
        <div class="srm-release-box">
          <b>School Personnel completes upon release of student</b>
          <div class="srm-box-line"><label>${safe(t[14])}</label>${input(state, 'releaseTime', safe)}</div>
          <div class="srm-box-line"><label>${safe(t[15])}</label>${input(state, 'releaseInitials', safe)}</div>
        </div>
      </div>
    </section>
  </div>`;
}
