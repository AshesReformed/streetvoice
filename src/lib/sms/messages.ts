// Urdu SMS texts. Kept short: Urdu SMS are Unicode, so each part holds only
// about 70 characters. The 6-digit tracking number is the key for everything.

export type ComplaintStatus = 'processing' | 'needs_review' | 'open' | 'in_progress' | 'resolved' | 'spam';

const STATUS_UR: Record<ComplaintStatus, string> = {
  processing: 'موصول ہو گئی، جانچ جاری ہے',
  needs_review: 'جانچ جاری ہے',
  open: 'محکمے کو بھیج دی گئی ہے',
  in_progress: 'اس پر کام جاری ہے',
  resolved: 'حل ہو گئی ہے',
  // Never tell a spammer they were flagged
  spam: 'جانچ جاری ہے',
};

export const sms = {
  citizenFiled: (id: string) =>
    `StreetVoice: آپ کی شکایت درج ہو گئی ہے۔ شکایت نمبر ${id}۔ متعلقہ محکمے کو بھیج کر آپ کو اطلاع دی جائے گی۔`,

  citizenRouted: (id: string, department: string) =>
    `StreetVoice: شکایت نمبر ${id} محکمہ ${department} کو بھیج دی گئی ہے۔`,

  citizenInProgress: (id: string) => `StreetVoice: شکایت نمبر ${id} پر کام شروع ہو گیا ہے۔`,

  citizenResolved: (id: string) => `StreetVoice: شکایت نمبر ${id} حل کر دی گئی ہے۔ شکریہ۔`,

  departmentDispatch: (c: {
    id: string;
    urgent: boolean;
    area: string | null;
    summary: string;
    link: string;
  }) =>
    [
      `StreetVoice نئی شکایت ${c.id}${c.urgent ? ' (فوری)' : ''}`,
      c.area ? `علاقہ: ${c.area}` : null,
      c.summary,
      `تفصیل اور آواز: ${c.link}`,
      `کام شروع ہو تو لکھیں: ${c.id} OK`,
      `مکمل ہو تو: ${c.id} DONE`,
    ]
      .filter(Boolean)
      .join('\n'),

  // Same problem as a complaint the department already has
  citizenLinked: (id: string, parentId: string) =>
    `StreetVoice: آپ کی شکایت ${id} اسی مسئلے کی شکایت ${parentId} کے ساتھ جوڑ دی گئی ہے، جو محکمے کو بھیجی جا چکی ہے۔ آپ کو اطلاع ملتی رہے گی۔`,

  departmentMoreReports: (id: string, count: number) =>
    `StreetVoice: شکایت ${id} کے بارے میں اب تک ${count} شہری شکایت کر چکے ہیں۔`,

  departmentReminder: (id: string, link: string) =>
    [
      `StreetVoice یاد دہانی: شکایت ${id} ابھی زیر التوا ہے۔`,
      `تفصیل: ${link}`,
      `کام شروع ہو تو لکھیں: ${id} OK`,
    ].join('\n'),

  supervisorEscalation: (id: string, department: string, days: number, link: string) =>
    [
      `StreetVoice: شکایت ${id} (${department}) ${days} دن سے حل نہیں ہوئی۔`,
      `تفصیل: ${link}`,
    ].join('\n'),

  adminAlert: (message: string) => `StreetVoice alert: ${message}`,

  status: (id: string, status: ComplaintStatus) =>
    `StreetVoice: شکایت نمبر ${id} ${STATUS_UR[status] ?? status}۔`,

  ackInProgress: (id: string) => `شکایت ${id}: کام شروع ہونا درج ہو گیا۔ شکریہ۔`,

  ackResolved: (id: string) => `شکایت ${id}: حل ہونا درج ہو گیا۔ شہری کو اطلاع دے دی گئی ہے۔ شکریہ۔`,

  notFound: (id: string) => `StreetVoice: شکایت نمبر ${id} نہیں ملی۔`,

  notYourDepartment: (id: string) => `StreetVoice: شکایت ${id} آپ کے محکمے کی نہیں ہے۔`,

  help: () =>
    'StreetVoice: جواب اس طرح لکھیں: شکایت نمبر اور OK (کام شروع) یا DONE (مکمل)۔ مثال: 482913 DONE',
};
