export const statuses = {
  CLAIMANT_ENTRY: 'Claimant Entry',
  APPROVED: 'Approved / Matched',
  SENT_TO_REUNIFIER: 'Sent to Reunifier',
  RELEASED: 'Released',
  REJECTED: 'Rejected / Escalated'
};

export function blankCard() {
  return {
    student: '',
    teacher: '',
    pickup: '',
    grade: '',
    relation: '',
    signature: '',
    proof: '',
    confirmed: '',
    datetime: '',
    staffsig: '',
    releaseStudent: '',
    releaseGrade: '',
    releaseTeacher: '',
    releasePerson: '',
    releaseSignature: '',
    releaseTime: '',
    releaseInitials: ''
  };
}

export function canSendToReunifier(status) {
  return status === statuses.APPROVED;
}

export function canCompleteRelease(status) {
  return status === statuses.SENT_TO_REUNIFIER;
}

export function approveMatch(state, student, contact) {
  if (!student) throw new Error('Approval blocked: select a student.');
  if (!contact || !contact.release) throw new Error('Approval blocked: select an authorized release contact.');
  return {
    ...state,
    status: statuses.APPROVED,
    card: {
      ...state.card,
      releaseStudent: state.card.student,
      releaseGrade: state.card.grade,
      releaseTeacher: state.card.teacher,
      releasePerson: state.card.pickup,
      releaseSignature: state.card.signature
    }
  };
}

export function sendToReunifier(state) {
  if (!canSendToReunifier(state.status)) throw new Error('Reunifier handoff blocked: card must be approved first.');
  return { ...state, status: statuses.SENT_TO_REUNIFIER };
}

export function completeRelease(state, releaseTime) {
  if (!canCompleteRelease(state.status)) throw new Error('Release blocked: card must be sent to reunifier first.');
  return {
    ...state,
    status: statuses.RELEASED,
    card: {
      ...state.card,
      releaseTime: state.card.releaseTime || releaseTime || ''
    }
  };
}

export function rejectOrEscalate(state) {
  return { ...state, status: statuses.REJECTED };
}

export function resetWorkflow(state) {
  return {
    ...state,
    status: statuses.CLAIMANT_ENTRY,
    studentId: '',
    contactId: '',
    query: '',
    readName: '',
    nameFlag: 'Not checked',
    previewUrl: '',
    card: blankCard()
  };
}
