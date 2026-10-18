// ==========================================
// نظام إدارة الرواتب
// ==========================================

// ==================== البيانات ====================
let employees = [];
let vouchers = [];
let notes = [];
let branches = [];
let nextVoucherId = 1;
let deletedRecords = { employees: [], vouchers: [], notes: [] };
let settings = {
    companyName: 'الشركة',
    companyLogo: '',
    accountantSignature: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    password: '102030'
};

function t(s) { return s; }
function translateLine(s) { return s; }
function postRender() {
    document.querySelectorAll('.table-container table').forEach(function(table) {
        const headers = table.tHead ? Array.from(table.tHead.rows[0].cells) : [];
        if (headers.length === 0) return;

        table.querySelectorAll('tbody tr, tfoot tr').forEach(function(row) {
            let columnIndex = 0;
            Array.from(row.cells).forEach(function(cell) {
                const columnSpan = cell.colSpan || 1;
                if (columnSpan === 1 && headers[columnIndex]) {
                    cell.dataset.label = headers[columnIndex].textContent.trim();
                } else {
                    delete cell.dataset.label;
                }
                columnIndex += columnSpan;
            });
        });
    });
}
function sweepText(root) { }
function transliterateAr2En(text) { return text || ''; }
function branchNameEn(b) { return b || ''; }
var MONTH_NAMES_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function getMonthNameAuto(month) { return MONTH_NAMES_AR[((month - 1) % 12 + 12) % 12]; }
function paymentMethodText(m) {
    if (m === 'cash') return 'نقداً من الصندوق';
    if (m === 'abuSaleh') return 'من أبو صالح';
    if (m === 'abuHussein') return 'من أبو حسين';
    return m;
}
function branchName(b) { return b || ''; }
function empName(emp) { return emp ? (emp.name || '') : ''; }
function displayCompanyName() {
    if (typeof settings === 'object' && settings && settings.companyName) return settings.companyName;
    return 'الشركة';
}
function noteTypeText(type) {
    var map = {absence: 'غياب', advance: 'سلفة', deduction: 'خصم', leave: 'إجازة سنوية', other: 'ملاحظة أخرى'};
    return map[type] || map.deduction;
}
function noteDisplayText(note) { return (note && note.text) ? note.text : ''; }
function formatDisp(s) {
    if (typeof s !== 'string' || !s) return s || '';
    var parts = s.split('-');
    if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0];
    return s;
}

const STORAGE_KEYS = {
    employees: 'payroll_employees',
    vouchers: 'payroll_vouchers',
    vouchersCounter: 'payroll_vouchers_counter',
    notes: 'payroll_notes',
    branches: 'payroll_branches',
    settings: 'payroll_settings',
    deletedRecords: 'payroll_deleted_records'
};

// ==================== Firebase (مزامنة عبر الإنترنت) ====================
const firebaseConfig = {
    apiKey: "AIzaSyAg23S7CtLd45f8QyTADKQv4Cg_yQw-3To",
    authDomain: "salary-47a43.firebaseapp.com",
    databaseURL: "https://salary-47a43-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "salary-47a43",
    storageBucket: "salary-47a43.firebasestorage.app",
    messagingSenderId: "80692575979",
    appId: "1:80692575979:web:1f982495359cc8a17f88ae",
    measurementId: "G-DL9ZXTRZEP"
};

let cloudEnabled = false;
let appInitialized = false;
try {
    firebase.initializeApp(firebaseConfig);
    cloudEnabled = true;
} catch (e) {
    cloudEnabled = false;
}

let lastSyncedSignature = '';

function cloudSignature() {
    return JSON.stringify([employees, vouchers, nextVoucherId, notes, branches, settings, deletedRecords]);
}

function pushToCloud() {
    if (!cloudEnabled) return;
    const sig = cloudSignature();
    if (sig === lastSyncedSignature) return;
    firebase.database().ref('state').set({
        employees: employees,
        vouchers: vouchers,
        nextVoucherId: nextVoucherId,
        notes: notes,
        branches: branches,
        settings: settings,
        deletedRecords: deletedRecords,
        lastUpdated: Date.now()
    }).then(function() {
        lastSyncedSignature = sig;
        setCloudStatus(true);
    }).catch(function(err) {
        setCloudStatus(false);
    });
}

function initCloudSync() {
    if (!cloudEnabled) {
        setCloudStatus(false, 'حفظ محلي فقط - تعذر تفعيل السحابة');
        return;
    }
    firebase.database().ref('state').on('value', function(snapshot) {
        const data = snapshot.val();
        if (!data || typeof data !== 'object') {
            setCloudStatus(true, 'لا توجد بيانات سحابية بعد - جاري الرفع الأول...');
            pushToCloud();
            return;
        }
        mergeCloudData(data);
    }, function(err) {
        setCloudStatus(false, 'خطأ في الاتصال: ' + ((err && (err.message || err.code)) || 'تعذر الوصول للسحابة'));
    });
}

function mergeArraysById(localArr, remoteArr) {
    if (!Array.isArray(localArr)) localArr = [];
    if (!Array.isArray(remoteArr)) return localArr.slice();
    const map = {};
    localArr.forEach(function(item) {
        if (item && item.id !== undefined) map[String(item.id)] = item;
    });
    remoteArr.forEach(function(item) {
        if (item && item.id !== undefined) map[String(item.id)] = item;
    });
    return Object.keys(map).map(function(k) { return map[k]; });
}

function mergeDeletedRecords(remoteRecords) {
    const merged = { employees: [], vouchers: [], notes: [] };
    Object.keys(merged).forEach(function(collection) {
        const ids = new Set((deletedRecords[collection] || []).concat(
            remoteRecords && Array.isArray(remoteRecords[collection]) ? remoteRecords[collection] : []
        ).map(String));
        merged[collection] = Array.from(ids);
    });
    deletedRecords = merged;
}

function filterDeletedRecords(records, collection) {
    const deletedIds = new Set(deletedRecords[collection] || []);
    return records.filter(function(record) {
        return !record || record.id === undefined || !deletedIds.has(String(record.id));
    });
}

function recordDeletion(collection, id) {
    const deletedIds = deletedRecords[collection];
    if (deletedIds && !deletedIds.includes(String(id))) deletedIds.push(String(id));
}

function clearDeletion(collection, id) {
    if (!deletedRecords[collection]) return;
    deletedRecords[collection] = deletedRecords[collection].filter(function(deletedId) {
        return String(deletedId) !== String(id);
    });
}

function getNextNoteId() {
    const maxId = notes.concat((deletedRecords.notes || []).map(function(id) {
        return {id: id};
    })).reduce(function(max, note) {
        const id = Number(note && note.id);
        return Number.isSafeInteger(id) && id > max ? id : max;
    }, 0);
    return maxId + 1;
}

function mergeCloudData(data) {
    let changed = false;

    const previousDeletedRecords = JSON.stringify(deletedRecords);
    mergeDeletedRecords(data.deletedRecords);
    if (JSON.stringify(deletedRecords) !== previousDeletedRecords) changed = true;
    Object.keys(deletedRecords).forEach(function(collection) {
        const remoteIds = data.deletedRecords && Array.isArray(data.deletedRecords[collection])
            ? data.deletedRecords[collection].map(String)
            : [];
        if (deletedRecords[collection].some(function(id) { return !remoteIds.includes(id); })) changed = true;
    });

    const allEmployees = mergeArraysById(employees, data.employees);
    const mergedEmployees = filterDeletedRecords(allEmployees, 'employees');
    if (mergedEmployees.length !== allEmployees.length) changed = true;
    if (JSON.stringify(mergedEmployees) !== JSON.stringify(employees)) { employees = mergedEmployees; changed = true; }
    sortEmployeesById();

    const allVouchers = mergeArraysById(vouchers, data.vouchers);
    const mergedVouchers = filterDeletedRecords(allVouchers, 'vouchers');
    if (mergedVouchers.length !== allVouchers.length) changed = true;
    if (JSON.stringify(mergedVouchers) !== JSON.stringify(vouchers)) { vouchers = mergedVouchers; changed = true; }

    const allNotes = mergeArraysById(notes, data.notes);
    const mergedNotes = filterDeletedRecords(allNotes, 'notes');
    if (mergedNotes.length !== allNotes.length) changed = true;
    if (JSON.stringify(mergedNotes) !== JSON.stringify(notes)) { notes = mergedNotes; changed = true; }

    const mergedBranches = mergeArraysById(branches, data.branches);
    if (JSON.stringify(mergedBranches) !== JSON.stringify(branches)) { branches = mergedBranches; changed = true; }

    let companySettingsChanged = false;
    if (data.settings && typeof data.settings === 'object') {
        const merged = Object.assign({}, settings, data.settings);
        if (JSON.stringify(merged) !== JSON.stringify(settings)) {
            settings = merged;
            changed = true;
            companySettingsChanged = true;
        }
    }
    if (companySettingsChanged) updateCompanyDisplay();
    if (typeof data.nextVoucherId === 'number' && data.nextVoucherId > nextVoucherId) {
        nextVoucherId = data.nextVoucherId;
        changed = true;
    }

    if (changed && appInitialized) {
        updateCompanyDisplay();
        refreshSalarySheet();
        refreshEmployees();
        refreshBranches();
        refreshVoucherPage();
        loadVouchers();
        refreshAbsenceDeductionReport();
        refreshBranchSalaryReceipts();
    }
    // إعادة رفع النسخة الموحّدة فقط عندما يطرأ تغيير، حتى تتقارب جميع الأجهزة
    if (changed) saveData();
}

function setCloudStatus(online, detail) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.textContent = translateLine(detail || (online ? 'متصل - مزامنة نشطة' : 'غير متصل - حفظ محلي'));
    el.className = 'sync-status ' + (online ? 'sync-online' : 'sync-offline');
    if ((!online) && !window.__syncErrorShown) {
        window.__syncErrorShown = true;
        setTimeout(function() {
            alert('تعذر التزامن مع السحابة. تأكد من:\n1) فتح البرنامج من الرابط (file:// لا يدعم السحابة)\n2) صلاحية الوصول للإنترنت\n3) إعدادات Firebase في وحدة التحكم');
        }, 400);
    }
}

function getNextVoucherId() {
    return nextVoucherId++;
}

// بيانات الموظفين الأولية
const seedEmployees = [
    {id:5,name:'نعمان عاصف جافيد',branch:'السواقين',salary:2500},
    {id:6,name:'فتحي عبدالعظيم',branch:'دبي القوز',salary:3000},
    {id:7,name:'محمد متولي',branch:'الجرف',salary:3000},
    {id:18,name:'عمر بابكر',branch:'العين',salary:3000},
    {id:19,name:'ارسلان عاصف',branch:'الشارقة',salary:2600},
    {id:20,name:'بلال علي عاشق',branch:'مطعم عجمان',salary:2300},
    {id:23,name:'النور علي آدم',branch:'أبو ظبي',salary:3000},
    {id:29,name:'محمد زيشان',branch:'العين',salary:2300},
    {id:30,name:'سمير مجدي',branch:'الجرف',salary:2700,otherDeductions:635},
    {id:37,name:'ياسر ذو افقار',branch:'السواقين',salary:3000},
    {id:39,name:'راسل حسين',branch:'رأس الخيمة',salary:2300},
    {id:40,name:'محمد عباس',branch:'دبي القوز',salary:2200},
    {id:41,name:'عبدالرحمن افتخار',branch:'رأس الخيمة',salary:1900,otherDeductions:300},
    {id:48,name:'فضل المولى عبد السلام',branch:'الجرف',salary:3000},
    {id:50,name:'محمد حجاز',branch:'مطعم الخوانيج',salary:2000},
    {id:61,name:'شفيق باكات',branch:'رأس الخيمة',salary:2200},
    {id:66,name:'باسم سرور المتولي',branch:'الجرف',salary:2700},
    {id:68,name:'محمد صادق الهندي',branch:'الشارقة',salary:3000},
    {id:69,name:'بلاش البنقالي',branch:'عجمان',salary:2500,otherDeductions:500},
    {id:70,name:'سهيل نواز باكستاني',branch:'عجمان',salary:2500},
    {id:71,name:'عرفان احمد',branch:'الشارقة',salary:1900},
    {id:72,name:'امين الرحمن',branch:'الجرف',salary:2500},
    {id:85,name:'محمد فايز العلم (فيصل)',branch:'أبو ظبي',salary:2200},
    {id:87,name:'جاشم الدين بشير احمد',branch:'الجرف',salary:2100},
    {id:90,name:'مارينا راي',branch:'العين',salary:2500},
    {id:100,name:'محمد رانق زيب',branch:'السواقين',salary:2800},
    {id:101,name:'فيصل ذو الفقار',branch:'خورفكان',salary:2500},
    {id:102,name:'سلطان معصوم',branch:'دبي القوز',salary:2200},
    {id:103,name:'مالك حسين',branch:'السواقين',salary:2800},
    {id:108,name:'أبو شهاب أحمد',branch:'عجمان',salary:2500},
    {id:114,name:'بشارة علي نصير',branch:'دبي القوز',salary:2500},
    {id:118,name:'محمد اشتياق',branch:'العين',salary:1900},
    {id:119,name:'ميتو مرشاد',branch:'الجرف',salary:2000,otherDeductions:67},
    {id:123,name:'محمد عبد المنعم',branch:'خورفكان',salary:2200},
    {id:126,name:'شاكيل خان',branch:'أبو ظبي',salary:1900},
    {id:132,name:'الرشيد فضل الله يوسف',branch:'الخوانيج',salary:2300,otherDeductions:73},
    {id:134,name:'محمد أمير سهيل',branch:'الشارقة',salary:1900},
    {id:135,name:'عدنان امير باكستاني',branch:'الجرف',salary:2200,otherDeductions:73},
    {id:137,name:'محمد فويز أحمد',branch:'رأس الخيمة',salary:2000},
    {id:141,name:'رحمن حسين اختيار',branch:'أبو ظبي',salary:1900},
    {id:146,name:'مدثر اكبر',branch:'الخوانيج',salary:2000},
    {id:151,name:'عبد الفتاح الاثيوبي',branch:'أبو ظبي',salary:1900},
    {id:152,name:'وحيد الإسلام',branch:'الشارقة',salary:1900},
    {id:154,name:'منذر قاسم السيد',branch:'مطعم أبو هيل',salary:2000},
    {id:157,name:'علي رضا مرسي',branch:'رأس الخيمة',salary:2500},
    {id:159,name:'نيشان محمود',branch:'أبو ظبي',salary:1900},
    {id:163,name:'نعيم راجا الهندي',branch:'دبي القوز',salary:2000},
    {id:166,name:'فياني نداميي الاوغندي',branch:'مطعم عجمان',salary:1700},
    {id:167,name:'اديسون اكانكواتسا الاوغندي',branch:'مطعم الشارقة',salary:1700},
    {id:168,name:'مصعب صلاح',branch:'رأس الخيمة',salary:2200},
    {id:170,name:'دانيش محمد الباكستاني',branch:'دبي القوز',salary:2200},
    {id:171,name:'محمد طارق البنقالي',branch:'خورفكان',salary:1900},
    {id:176,name:'محمد مبارك حسين البنقالي',branch:'مطعم الخوانيج',salary:1700},
    {id:177,name:'حمزة حيدر كنوز',branch:'دبي القوز',salary:1800},
    {id:183,name:'محمد يونس البنقالي',branch:'مطعم عجمان',salary:1700},
    {id:184,name:'محمد عبدالوهاب',branch:'الجرف',salary:1900},
    {id:185,name:'رسول خان',branch:'مطعم عجمان',salary:2500},
    {id:186,name:'محمد معاذ',branch:'مطعم الشارقة',salary:2000},
    {id:187,name:'محمد شاهنواز',branch:'مطعم الخوانيج',salary:1800},
    {id:188,name:'فرحان شهاب الدين',branch:'مطعم عجمان',salary:1700},
    {id:190,name:'عبدالرحمن أبو سوفيان',branch:'مطعم الشارقة',salary:2000},
    {id:192,name:'فيداء حسين الهندي',branch:'مطعم أبو هيل',salary:1800},
    {id:193,name:'توصيف احمد الهندي',branch:'الخوانيج',salary:2000},
    {id:194,name:'شمس الدين الهندي',branch:'دبي القوز',salary:1900,otherDeductions:650},
    {id:196,name:'محمد غلام شاهنواز',branch:'الجرف',salary:2200,otherDeductions:73},
    {id:197,name:'محمد حفيظ الهندي',branch:'مطعم الخوانيج',salary:1800},
    {id:198,name:'محمد ريحان الهندي',branch:'مطعم الخوانيج',salary:1800},
    {id:199,name:'عرفات الاوغندي',branch:'مطعم عجمان',salary:1500},
    {id:200,name:'انطوني الاوغندي',branch:'مطعم الخوانيج',salary:1500},
    {id:202,name:'عبدالله حسين السوداني',branch:'مطعم الشارقة',salary:1900,otherDeductions:200},
    {id:203,name:'ذكر الله افضل',branch:'مطعم أبو هيل',salary:1800},
    {id:204,name:'محمد محسن الهندي',branch:'مطعم الشارقة',salary:1800},
    {id:205,name:'محمد فهد الهندي',branch:'مطعم أبو هيل',salary:1800},
    {id:206,name:'محمد سيف خان',branch:'مطعم أبو هيل',salary:1500},
    {id:207,name:'ساشين كومار الهندي',branch:'مطعم عجمان',salary:1500},
    {id:208,name:'ادريس حمد السوداني',branch:'مطعم الشارقة',salary:1700},
    {id:209,name:'عبد الرحيم محمد يوسف',branch:'مطعم الخوانيج',salary:1500},
    {id:211,name:'محمد شهاب الهندي',branch:'مطعم عجمان',salary:1500},
    {id:212,name:'احمد الصادق علي آدم',branch:'عجمان',salary:1900},
    {id:213,name:'الصادق احمد يوسف',branch:'خورفكان',salary:1700},
    {id:214,name:'الصادق رابح',branch:'الخوانيج',salary:1700},
    {id:217,name:'نعمانيا الاوغندي',branch:'الشارقة',salary:1700},
    {id:218,name:'فرحان خان',branch:'مطعم عجمان',salary:1500},
    {id:219,name:'ابوبكر ابوسفيان',branch:'مطعم عجمان',salary:1800},
    {id:220,name:'حسن محمد البنقالي',branch:'مطعم أبو هيل',salary:1500},
    {id:225,name:'محمد احمد فيزان اخو فيصل',branch:'مطعم الشارقة',salary:1800},
    {id:227,name:'سامي شريف الغلبان',branch:'الجرف',salary:2500,absences:15},
    {id:229,name:'معروف خان',branch:'عجمان',salary:1700},
    {id:230,name:'محمد عبد الحي السوداني',branch:'عجمان',salary:1700},
    {id:232,name:'عرفان حسين سيد الهندي',branch:'الجرف',salary:1700},
    {id:233,name:'محمد ساهيل الهندي',branch:'مطعم عجمان',salary:1500},
    {id:234,name:'عامر أبو زار الهندي',branch:'مطعم عجمان',salary:1500},
    {id:235,name:'عبدالرحمن احمد سليم غانا',branch:'مطعم أبو هيل',salary:1500},
    {id:236,name:'عثمان عبدو علي الاثيوبي',branch:'الجرف',salary:1900},
    {id:239,name:'ابرار محمد باكستاني',branch:'العين',salary:1700},
    {id:240,name:'محمد فيصل مرسلين',branch:'مطعم عجمان',salary:1500}
];

// ==================== الحفظ والتحميل ====================
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e) {
        console.error('تعذر حفظ البيانات محلياً (' + key + ')', e);
        return false;
    }
}

function saveData() {
    const saveResults = [
        safeSetItem(STORAGE_KEYS.employees, JSON.stringify(employees)),
        safeSetItem(STORAGE_KEYS.vouchers, JSON.stringify(vouchers)),
        safeSetItem(STORAGE_KEYS.vouchersCounter, nextVoucherId),
        safeSetItem(STORAGE_KEYS.notes, JSON.stringify(notes)),
        safeSetItem(STORAGE_KEYS.branches, JSON.stringify(branches)),
        safeSetItem(STORAGE_KEYS.settings, JSON.stringify(settings)),
        safeSetItem(STORAGE_KEYS.deletedRecords, JSON.stringify(deletedRecords))
    ];
    if (saveResults.some(function(saved) { return !saved; })) {
        if (!window.__localStorageErrorShown) {
            window.__localStorageErrorShown = true;
            alert('تعذر حفظ بعض البيانات على هذا الجهاز. تحقق من مساحة التخزين ثم أعد المحاولة.');
        }
    } else {
        window.__localStorageErrorShown = false;
    }
    pushToCloud();
}

function sortEmployeesById() {
    employees.sort((a, b) => a.id - b.id);
}

function loadData() {
    const savedEmployees = localStorage.getItem(STORAGE_KEYS.employees);
    const savedVouchers = localStorage.getItem(STORAGE_KEYS.vouchers);
    const savedNotes = localStorage.getItem(STORAGE_KEYS.notes);
    const savedBranches = localStorage.getItem(STORAGE_KEYS.branches);
    const savedSettings = localStorage.getItem(STORAGE_KEYS.settings);
    const savedDeletedRecords = localStorage.getItem(STORAGE_KEYS.deletedRecords);
    if (savedDeletedRecords) {
        const parsedDeletedRecords = JSON.parse(savedDeletedRecords);
        mergeDeletedRecords(parsedDeletedRecords);
    }

    if (savedEmployees) {
        employees = JSON.parse(savedEmployees);
    } else {
        employees = seedEmployees.map(e => ({
            id: e.id,
            name: e.name,
            branch: e.branch,
            position: e.position || '',
            baseSalary: e.salary || 0,
            absences: e.absences || 0,
            otherDeductions: e.otherDeductions || 0
        }));
    }

    vouchers = savedVouchers ? JSON.parse(savedVouchers) : [];
    notes = savedNotes ? JSON.parse(savedNotes) : [];
    branches = savedBranches ? JSON.parse(savedBranches) : [];
    settings = savedSettings ? Object.assign({}, settings, JSON.parse(savedSettings)) : settings;
    employees = filterDeletedRecords(employees, 'employees');
    vouchers = filterDeletedRecords(vouchers, 'vouchers');
    notes = filterDeletedRecords(notes, 'notes');

    const savedCounter = localStorage.getItem(STORAGE_KEYS.vouchersCounter);
    if (savedCounter !== null) {
        nextVoucherId = parseInt(savedCounter) || 1;
    } else {
        nextVoucherId = vouchers.length > 0 ? Math.max(...vouchers.map(v => v.id)) + 1 : 1;
    }

    sortEmployeesById();
}

// ==================== النسخة الاحتياطية ====================
function exportBackup() {
    const backup = {
        exportedAt: new Date().toISOString(),
        version: 1,
        employees: employees,
        vouchers: vouchers,
        nextVoucherId: nextVoucherId,
        notes: notes,
        branches: branches,
        settings: settings,
        deletedRecords: deletedRecords
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'payroll-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    alert('تم تنزيل النسخة الاحتياطية بنجاح');
}

function pickBackupFile() {
    document.getElementById('import-backup-file').click();
}

function importBackupFile(fileInput) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (!data || typeof data !== 'object') throw new Error('invalid');
            if (Array.isArray(data.employees)) employees = data.employees;
            sortEmployeesById();
            if (Array.isArray(data.vouchers)) vouchers = data.vouchers;
            if (Array.isArray(data.notes)) notes = data.notes;
            if (Array.isArray(data.branches)) branches = data.branches;
            mergeDeletedRecords(data.deletedRecords);
            employees = filterDeletedRecords(employees, 'employees');
            vouchers = filterDeletedRecords(vouchers, 'vouchers');
            notes = filterDeletedRecords(notes, 'notes');
            if (typeof data.nextVoucherId === 'number') nextVoucherId = data.nextVoucherId;
            if (data.settings && typeof data.settings === 'object') settings = Object.assign({}, settings, data.settings);
            saveData();
            updateCompanyDisplay();
            refreshSalarySheet();
            refreshEmployees();
            refreshBranches();
            refreshVoucherPage();
            loadVouchers();
            alert('تم استيراد النسخة الاحتياطية وحفظها في السحابة بنجاح');
        } catch (err) {
            alert('ملف غير صالح: تأكد من اختيار ملف نسخة احتياطية صحيح');
        }
        fileInput.value = '';
    };
    reader.onerror = function() {
        alert('تعذر قراءة الملف');
    };
    reader.readAsText(file);
}

// ==================== الأدوات المساعدة ====================
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function companyNameHTML(name) {
    const w = (name || '').trim().split(/\s+/).filter(Boolean);
    let lines;
    if (w.length === 4) lines = [w.slice(0, 1), w.slice(1, 3), w.slice(3)];
    else if (w.length === 5) lines = [w.slice(0, 2), w.slice(2, 4), w.slice(4)];
    else if (w.length === 6) lines = [w.slice(0, 2), w.slice(2, 4), w.slice(4)];
    else if (w.length === 7) lines = [w.slice(0, 2), w.slice(2, 5), w.slice(5)];
    else if (w.length === 8) lines = [w.slice(0, 3), w.slice(3, 6), w.slice(6)];
    else lines = [w];
    return lines.filter(l => l.length).map(l => `<div class="cn-line">${l.join(' ')}</div>`).join('');
}

function daysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function localDateKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function employeeActiveInPeriod(emp, year, month) {
    if (!emp.employmentStartDate) return true;
    const start = parseDateKey(emp.employmentStartDate);
    if (!start || Number.isNaN(start.getTime())) return true;
    return start.getFullYear() < year || (start.getFullYear() === year && start.getMonth() + 1 <= month);
}

function noteMatchesPeriod(note, year, month) {
    return Number(note.year) === Number(year) && Number(note.month) === Number(month);
}

function getMonthName(month) {
    return getMonthNameAuto(month);
}

function getPaymentMethodName(method) {
    return paymentMethodText(method);
}

function getEmployeeById(id) {
    return employees.find(e => e.id === parseInt(id));
}

function getBranches() {
    const all = new Set(employees.map(e => e.branch));
    branches.forEach(b => all.add(b));
    return [...all].filter(b => b).sort();
}

// عدد أيام الغياب → احتساب الخصم تلقائياً
function calcAbsenceDeduction(emp, year, month) {
    const days = daysInMonth(year, month);
    return Math.round((Math.round(emp.baseSalary || 0) / days) * (emp.absences || 0));
}

function salaryVoucherMatchesPeriod(voucher, empId, year, month) {
    if (!voucher.isSalary || voucher.employeeId !== empId) return false;
    if (voucher.year != null && voucher.month != null) {
        return Number(voucher.year) === year && Number(voucher.month) === month;
    }
    const dateParts = String(voucher.date || '').split('-');
    return parseInt(dateParts[0], 10) === year && parseInt(dateParts[1], 10) === month;
}

function getSalaryVouchersForPeriod(empId, year, month) {
    return vouchers.filter(voucher => salaryVoucherMatchesPeriod(voucher, empId, year, month));
}

function canIssueSalaryVoucher(voucher) {
    if (!voucher || !voucher.isSalary) return true;

    const dateParts = String(voucher.date || '').split('-');
    const year = Number(voucher.year != null ? voucher.year : dateParts[0]);
    const month = Number(voucher.month != null ? voucher.month : dateParts[1]);
    const emp = getEmployeeById(voucher.employeeId);
    if (emp && Number.isFinite(year) && Number.isFinite(month) && employeeActiveInPeriod(emp, year, month)) {
        const calc = calcEmployeeSalary(emp, year, month);
        const alreadyIssued = vouchers.some(savedVoucher => savedVoucher.id === voucher.id)
            || getSalaryVouchersForPeriod(voucher.employeeId, year, month).length > 0;
        if (alreadyIssued ? calc.net + calc.salaryVoucherDeduction > 0 : calc.net > 0) return true;
    }

    alert('لا يوجد مبلغ مستحق لإصدار سند راتب لهذا الموظف في الشهر المحدد');
    return false;
}

function formatAbsenceDays(days) {
    const whole = Math.floor(days);
    const frac = Math.round((days - whole) * 2) / 2;
    if (frac === 0) return whole + ' يوم';
    if (whole === 0) return 'نصف يوم';
    return whole + ' يوم ونصف';
}

function calcEmployeeSalary(emp, year, month) {
    const baseRaw = Math.round(emp.baseSalary || 0);
    const totalDays = daysInMonth(year, month);
    const leaveDays = leaveDaysInMonth(emp, year, month);
    const baseSalary = Math.round((baseRaw * Math.max(0, totalDays - leaveDays)) / totalDays);
    const otherDeductions = Math.round(emp.otherDeductions || 0);
    const absenceDeduction = calcAbsenceDeduction(emp, year, month);
    const notesForEmp = notes.filter(n => n.employeeId === emp.id && noteMatchesPeriod(n, year, month));
    const notesTotal = notesForEmp.reduce((sum, n) => sum + Math.round(n.amount), 0);
    const salaryVoucherDeduction = getSalaryVouchersForPeriod(emp.id, year, month)
        .reduce((sum, voucher) => sum + Math.round(voucher.amount || 0), 0);
    const net = baseSalary + notesTotal - absenceDeduction - otherDeductions - salaryVoucherDeduction;
    return {
        baseSalary: baseSalary,
        absenceDeduction: absenceDeduction,
        otherDeductions: otherDeductions,
        notesDeductions: notesTotal < 0 ? -notesTotal : 0,
        salaryVoucherDeduction: salaryVoucherDeduction,
        totalDeductions: absenceDeduction + otherDeductions + (notesTotal < 0 ? -notesTotal : 0) + salaryVoucherDeduction,
        leaveDays: leaveDays,
        net: net
    };
}

// ==================== تسجيل الدخول ====================
function initLogin() {
    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        if (username === 'admin' && password === settings.password && showPage('employees')) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app').style.display = 'flex';
            document.getElementById('login-error').style.display = 'none';
            initApp();
        } else {
            document.getElementById('login-error').style.display = 'block';
        }
    });
}

function logout() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    document.querySelectorAll('.page').forEach(function(page) {
        page.classList.remove('active');
        page.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
    });
}

// ==================== التنقل ====================
function showPage(pageId) {
    const navMenu = document.querySelector('.nav-menu');
    const navItem = navMenu && Array.from(navMenu.querySelectorAll('.nav-item')).find(function(item) {
        return item.getAttribute('data-page') === pageId;
    });
    const selectedPage = document.getElementById(pageId);
    if (!selectedPage || !selectedPage.classList.contains('page') || !navItem) return false;

    document.querySelectorAll('.page').forEach(function(candidate) {
        const isSelected = candidate === selectedPage;
        candidate.classList.toggle('active', isSelected);
        candidate.setAttribute('aria-hidden', String(!isSelected));
    });
    document.querySelectorAll('.nav-item').forEach(function(item) {
        const isSelected = item === navItem;
        item.classList.toggle('active', isSelected);
        if (isSelected) {
            item.setAttribute('aria-current', 'page');
        } else {
            item.removeAttribute('aria-current');
        }
    });
    return true;
}

function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(function(item) {
        item.addEventListener('click', function() {
            showPage(item.getAttribute('data-page'));
        });
    });

    document.getElementById('logout-btn').addEventListener('click', logout);
}

function reportDateForNote(note) {
    if (note.type === 'absence' && note.absenceFrom) return note.absenceFrom;
    return String(note.year || '') + '-' + String(note.month || '').padStart(2, '0') + '-' + String(note.day || 1).padStart(2, '0');
}

function reportRangeForNote(note) {
    const start = note.type === 'absence' && note.absenceFrom ? note.absenceFrom : reportDateForNote(note);
    const end = note.type === 'absence' && note.absenceTo ? note.absenceTo : start;
    return {start: start, end: end};
}

function getAbsenceDeductionReportItems() {
    const query = document.getElementById('absence-deduction-search').value.trim().toLocaleLowerCase();
    const branch = document.getElementById('absence-deduction-branch').value;
    const type = document.getElementById('absence-deduction-type').value;
    const from = document.getElementById('absence-deduction-from').value;
    const to = document.getElementById('absence-deduction-to').value;

    return notes.filter(function(note) {
        if (!note || (note.type !== 'absence' && note.type !== 'deduction')) return false;
        if (type && note.type !== type) return false;
        const emp = getEmployeeById(note.employeeId);
        const employeeName = emp ? empName(emp) : '';
        const employeeId = String(note.employeeId || '');
        if (query && !employeeName.toLocaleLowerCase().includes(query) && !employeeId.includes(query)) return false;
        if (branch && (!emp || emp.branch !== branch)) return false;
        const range = reportRangeForNote(note);
        if (from && range.end < from) return false;
        if (to && range.start > to) return false;
        return true;
    }).sort(function(a, b) {
        return reportDateForNote(b).localeCompare(reportDateForNote(a)) || Number(b.id) - Number(a.id);
    });
}

function refreshAbsenceDeductionReport() {
    const tbody = document.getElementById('absence-deduction-tbody');
    if (!tbody) return;

    const branchSelect = document.getElementById('absence-deduction-branch');
    const selectedBranch = branchSelect.value;
    branchSelect.innerHTML = '<option value="">جميع الفروع</option>';
    getBranches().forEach(function(branch) {
        const option = document.createElement('option');
        option.value = branch;
        option.textContent = branchName(branch);
        branchSelect.appendChild(option);
    });
    branchSelect.value = selectedBranch;
    const items = getAbsenceDeductionReportItems();
    let totalDays = 0;
    let totalAmount = 0;
    tbody.innerHTML = '';

    items.forEach(function(note, index) {
        const emp = getEmployeeById(note.employeeId);
        const absenceDays = note.type === 'absence' ? Number(note.absenceDays) || 0 : 0;
        const amount = Math.abs(Number(note.amount) || 0);
        totalDays += absenceDays;
        totalAmount += amount;

        const row = document.createElement('tr');
        const values = [
            String(index + 1),
            emp ? empName(emp) : 'موظف محذوف',
            String(note.employeeId || '—'),
            emp ? branchName(emp.branch) : '—',
            note.type === 'absence' ? 'غياب' : 'خصم',
            note.type === 'absence'
                ? formatVoucherDate(note.absenceFrom || reportDateForNote(note)) + (note.absenceTo && note.absenceTo !== (note.absenceFrom || reportDateForNote(note)) ? ' — ' + formatVoucherDate(note.absenceTo) : '')
                : formatVoucherDate(reportDateForNote(note)),
            note.text || (note.type === 'absence' ? 'غياب' : 'خصم'),
            note.type === 'absence' ? formatNumber(absenceDays) : '—',
            formatNumber(amount)
        ];
        values.forEach(function(value, cellIndex) {
            const cell = document.createElement('td');
            cell.textContent = value;
            if (cellIndex === 1) cell.className = 'report-employee-name';
            if (cellIndex === 8) cell.className = 'report-amount';
            if (cellIndex === 4) {
                const badge = document.createElement('span');
                badge.className = 'report-type-badge report-type-' + note.type;
                badge.textContent = value;
                cell.textContent = '';
                cell.appendChild(badge);
            }
            row.appendChild(cell);
        });

        const actionCell = document.createElement('td');
        actionCell.className = 'report-actions';
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'btn btn-primary btn-sm';
        editButton.textContent = 'تعديل';
        editButton.addEventListener('click', function() { startEditReportNote(note.id); });
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'btn btn-danger btn-sm';
        deleteButton.textContent = 'حذف';
        deleteButton.addEventListener('click', function() { deleteNote(note.id); });
        actionCell.appendChild(editButton);
        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });

    if (!items.length) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 10;
        emptyCell.className = 'report-empty';
        emptyCell.textContent = notes.some(function(note) { return note && (note.type === 'absence' || note.type === 'deduction'); })
            ? 'لا توجد قيود مطابقة لمعايير البحث.'
            : 'لا توجد قيود غياب أو خصومات مؤرخة حتى الآن.';
        emptyRow.appendChild(emptyCell);
        tbody.appendChild(emptyRow);
    }

    document.getElementById('absence-deduction-count').textContent = formatNumber(items.length);
    document.getElementById('absence-deduction-days').textContent = formatNumber(totalDays);
    document.getElementById('absence-deduction-total').textContent = formatNumber(totalAmount);

    const tfoot = document.getElementById('absence-deduction-tfoot');
    tfoot.innerHTML = '';
    if (items.length) {
        const totalRow = document.createElement('tr');
        totalRow.innerHTML = '<td colspan="7">إجمالي القيود المعروضة</td><td>' + formatNumber(totalDays) + '</td><td class="report-amount">' + formatNumber(totalAmount) + '</td><td></td>';
        tfoot.appendChild(totalRow);
    }
    postRender();
}

function resetAbsenceDeductionFilters() {
    document.getElementById('absence-deduction-search').value = '';
    document.getElementById('absence-deduction-branch').value = '';
    document.getElementById('absence-deduction-type').value = '';
    document.getElementById('absence-deduction-from').value = '';
    document.getElementById('absence-deduction-to').value = '';
    refreshAbsenceDeductionReport();
}

function exportAbsenceDeductionReport() {
    if (typeof XLSX === 'undefined' || !XLSX.utils) {
        alert('تعذر تحميل أداة تصدير Excel. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.');
        return;
    }

    const items = getAbsenceDeductionReportItems();
    const details = [['م', 'اسم الموظف', 'الرقم الوظيفي', 'الفرع', 'نوع القيد', 'تاريخ البداية', 'تاريخ النهاية', 'البيان', 'أيام الغياب', 'قيمة الخصم']];
    items.forEach(function(note, index) {
        const emp = getEmployeeById(note.employeeId);
        const absenceDays = note.type === 'absence' ? Number(note.absenceDays) || 0 : 0;
        const amount = Math.abs(Number(note.amount) || 0);
        details.push([
            index + 1,
            emp ? empName(emp) : 'موظف محذوف',
            note.employeeId || '',
            emp ? branchName(emp.branch) : '',
            note.type === 'absence' ? 'غياب' : 'خصم',
            note.type === 'absence' ? (note.absenceFrom || reportDateForNote(note)) : reportDateForNote(note),
            note.type === 'absence' ? (note.absenceTo || note.absenceFrom || reportDateForNote(note)) : reportDateForNote(note),
            note.text || '',
            absenceDays,
            amount
        ]);
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(details), 'القيود');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, 'تقرير_الغياب_والخصومات_' + date + '.xlsx');
}

function escapeReportHtml(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function(char) {
        return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char];
    });
}

function printAbsenceDeductionReport() {
    const items = getAbsenceDeductionReportItems();
    const totalDays = items.reduce(function(total, note) {
        return total + (note.type === 'absence' ? Number(note.absenceDays) || 0 : 0);
    }, 0);
    const totalAmount = items.reduce(function(total, note) {
        return total + Math.abs(Number(note.amount) || 0);
    }, 0);
    const rows = items.map(function(note, index) {
        const emp = getEmployeeById(note.employeeId);
        const date = note.type === 'absence'
            ? formatVoucherDate(note.absenceFrom || reportDateForNote(note)) + (note.absenceTo && note.absenceTo !== (note.absenceFrom || reportDateForNote(note)) ? ' — ' + formatVoucherDate(note.absenceTo) : '')
            : formatVoucherDate(reportDateForNote(note));
        return '<tr><td>' + (index + 1) + '</td><td>' + escapeReportHtml(emp ? empName(emp) : 'موظف محذوف') +
            '</td><td>' + escapeReportHtml(note.employeeId || '—') + '</td><td>' +
            escapeReportHtml(emp ? branchName(emp.branch) : '—') + '</td><td>' +
            (note.type === 'absence' ? 'غياب' : 'خصم') + '</td><td>' + escapeReportHtml(date) +
            '</td><td>' + escapeReportHtml(note.text || '') + '</td><td>' +
            (note.type === 'absence' ? formatNumber(Number(note.absenceDays) || 0) : '—') + '</td><td>' +
            formatNumber(Math.abs(Number(note.amount) || 0)) + '</td></tr>';
    }).join('');
    const branch = document.getElementById('absence-deduction-branch');
    const titleDetails = [
        branch.value ? 'الفرع: ' + branch.options[branch.selectedIndex].text : 'جميع الفروع',
        document.getElementById('absence-deduction-search').value.trim()
            ? 'الموظف: ' + document.getElementById('absence-deduction-search').value.trim()
            : '',
        document.getElementById('absence-deduction-type').value
            ? 'النوع: ' + (document.getElementById('absence-deduction-type').value === 'absence' ? 'غياب' : 'خصم')
            : '',
        document.getElementById('absence-deduction-from').value ? 'من ' + formatVoucherDate(document.getElementById('absence-deduction-from').value) : '',
        document.getElementById('absence-deduction-to').value ? 'إلى ' + formatVoucherDate(document.getElementById('absence-deduction-to').value) : ''
    ].filter(Boolean).join(' | ');
    const printArea = document.getElementById('absence-deduction-print-area');
    printArea.innerHTML = '<div class="absence-deduction-print"><h1>تقرير الغياب والخصومات</h1><p class="print-subtitle">' +
        escapeReportHtml(titleDetails) + '</p><div class="print-totals"><span>عدد القيود: ' + formatNumber(items.length) +
        '</span><span>أيام الغياب: ' + formatNumber(totalDays) + '</span><span>إجمالي الخصومات: ' +
        formatNumber(totalAmount) + ' درهم</span></div><h2>تفاصيل القيود المؤرخة</h2><table><thead><tr><th>م</th><th>الموظف</th><th>الرقم الوظيفي</th><th>الفرع</th><th>النوع</th><th>التاريخ</th><th>البيان</th><th>أيام الغياب</th><th>قيمة الخصم</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="9" style="text-align:center">لا توجد قيود مطابقة.</td></tr>') +
        '</tbody></table></div>';
    printArea.style.display = 'block';
    const nativePrinting = printWithNative('تقرير الغياب والخصومات');
    if (!nativePrinting) {
        window.print();
        printArea.style.display = 'none';
    }
}

// ==================== شهر / سنة ====================
function populateMonthYearSelectors() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const monthSel1 = document.getElementById('salary-month');
    const monthSel3 = document.getElementById('salary-voucher-month');
    const monthSel4 = document.getElementById('branch-summary-month');
    const monthSel5 = document.getElementById('salary-receipt-month');

    [monthSel1, monthSel3, monthSel4, monthSel5].forEach(sel => {
        if (!sel) return;
        const prevVal = sel.value;
        sel.innerHTML = '';
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = getMonthName(m);
            if (m === currentMonth) opt.selected = true;
            sel.appendChild(opt);
        }
        if (prevVal) sel.value = prevVal;
    });

    const yearSel1 = document.getElementById('salary-year');
    const yearSel3 = document.getElementById('salary-voucher-year');
    const yearSel4 = document.getElementById('branch-summary-year');
    const yearSel5 = document.getElementById('salary-receipt-year');

    [yearSel1, yearSel3, yearSel4, yearSel5].forEach(sel => {
        if (!sel) return;
        const prevYear = sel.value;
        sel.innerHTML = '';
        for (let y = currentYear - 2; y <= currentYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === currentYear) opt.selected = true;
            sel.appendChild(opt);
        }
        if (prevYear) sel.value = prevYear;
    });
}

function populateBranchFilters() {
    const filters = ['salary-branch-filter'];
    const branches = getBranches();
    filters.forEach(id => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">جميع الفروع</option>';
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = branchName(b);
            if (b === currentVal) opt.selected = true;
            sel.appendChild(opt);
        });
    });

    refreshSalaryReceiptBranchChoices();

    const branchesList = document.getElementById('branches-list');
    if (branchesList) {
        branchesList.innerHTML = '';
        branches.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            branchesList.appendChild(opt);
        });
    }
    refreshAbsenceDeductionReport();
    postRender();
}

function refreshSalaryReceiptBranchChoices() {
    const receiptBranch = document.getElementById('salary-receipt-branch');
    if (receiptBranch) {
        const selectedBranch = receiptBranch.value;
        const availableBranches = getBranches();
        receiptBranch.innerHTML = '<option value="">اختر الفرع</option>';
        availableBranches.forEach(function(branchNameValue) {
            const option = document.createElement('option');
            option.value = branchNameValue;
            option.textContent = branchName(branchNameValue);
            receiptBranch.appendChild(option);
        });
        if (availableBranches.includes(selectedBranch)) receiptBranch.value = selectedBranch;
    }
}

// ==================== ملخص الفروع ====================
function refreshBranches() {
    const summaryBranchSel = document.getElementById('branch-summary-branch');
    if (!summaryBranchSel) return;
    const currentVal = summaryBranchSel.value;
    summaryBranchSel.innerHTML = '<option value="">اختر الفرع...</option>';
    getBranches().forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = branchName(b);
        if (b === currentVal) opt.selected = true;
        summaryBranchSel.appendChild(opt);
    });

    refreshBranchEmployeesSummary();
}

function refreshBranchEmployeesSummary() {
    const wrapper = document.getElementById('branch-employees-table-wrapper');
    if (!wrapper) return;

    const branch = document.getElementById('branch-summary-branch').value;
if (!branch) {
        wrapper.innerHTML = '<p style="color:var(--text-light); padding:30px; text-align:center">اختر فرعاً لعرض موظفيه وكشف رواتب مختصر</p>';
        postRender();
        return;
    }

    const year = parseInt(document.getElementById('branch-summary-year').value);
    const month = parseInt(document.getElementById('branch-summary-month').value);
    const branchEmps = employees.filter(e => e.branch === branch && employeeActiveInPeriod(e, year, month) && !onFullLeave(e, year, month));

    if (branchEmps.length === 0) {
        wrapper.innerHTML = '<p style="color:var(--text-light); padding:30px; text-align:center">لا يوجد موظفون في هذا الفرع</p>';
        postRender();
        return;
    }

    const monthName = getMonthName(month);
    let rows = '';
    let totals = {count:0,base:0,absence:0,deductions:0,net:0};

    branchEmps.forEach((emp, idx) => {
        const c = calcEmployeeSalary(emp, year, month);
        const deductions = c.otherDeductions + c.notesDeductions + c.salaryVoucherDeduction;
        totals.count++;
        totals.base += c.baseSalary;
        totals.absence += c.absenceDeduction;
        totals.deductions += deductions;
        totals.net += c.net;

        rows += `<tr>
            <td>${idx + 1}</td>
            <td>${empName(emp)}</td>
            <td class="amount">${formatNumber(c.baseSalary)}</td>
            <td class="amount">${formatNumber(c.absenceDeduction)}</td>
            <td class="amount">${formatNumber(deductions)}</td>
            <td class="amount" style="font-weight:bold;color:${c.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatNumber(c.net)}</td>
        </tr>`;
    });

    wrapper.innerHTML = `
        <h4 style="margin:15px 0 10px; color:var(--primary)">${t('موظفو ')} ${branchName(branch)} — ${monthName} ${year} (${branchEmps.length} ${t('موظف')})</h4>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>م</th>
                        <th>اسم الموظف</th>
                        <th>الراتب الأساسي</th>
                        <th>خصم الغياب</th>
                        <th>الخصومات</th>
                        <th>الصافي</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
                <tfoot>
                    <tr>
                        <td colspan="2" style="text-align:center;font-weight:bold">${t('إجمالي ')} ${branchName(branch)}</td>
                        <td class="amount">${formatNumber(totals.base)}</td>
                        <td class="amount">${formatNumber(totals.absence)}</td>
                        <td class="amount">${formatNumber(totals.deductions)}</td>
                        <td class="amount" style="font-weight:bold;color:var(--success)">${formatNumber(totals.net)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    postRender();
}

function printWithNative(jobName) {
    const capacitor = window.Capacitor;
    const nativePrint = capacitor && capacitor.Plugins && capacitor.Plugins.NativePrint
        ? capacitor.Plugins.NativePrint
        : capacitor && typeof capacitor.registerPlugin === 'function'
            ? capacitor.registerPlugin('NativePrint')
            : null;
    if (!nativePrint || typeof nativePrint.print !== 'function') return false;

    nativePrint.print({ jobName: jobName }).catch(function(error) {
        alert('تعذر فتح شاشة حفظ PDF: ' + ((error && error.message) || 'حاول مرة أخرى'));
    });
    return true;
}

function printBranchSummary() {
    const branch = document.getElementById('branch-summary-branch').value;
    if (!branch) { alert('يرجى اختيار الفرع أولاً'); return; }
    const year = parseInt(document.getElementById('branch-summary-year').value);
    const month = parseInt(document.getElementById('branch-summary-month').value);
    const monthName = getMonthName(month);
    const branchEmps = employees.filter(e => e.branch === branch && employeeActiveInPeriod(e, year, month) && !onFullLeave(e, year, month));

    let rows = '';
    let totals = {count:0,base:0,absence:0,deductions:0,net:0};

    branchEmps.forEach((emp, idx) => {
        const c = calcEmployeeSalary(emp, year, month);
        const deductions = c.otherDeductions + c.notesDeductions + c.salaryVoucherDeduction;
        totals.count++;
        totals.base += c.baseSalary;
        totals.absence += c.absenceDeduction;
        totals.deductions += deductions;
        totals.net += c.net;

        rows += `<tr>
            <td>${idx + 1}</td>
            <td>${empName(emp)}</td>
            <td>${formatNumber(c.baseSalary)}</td>
            <td>${formatNumber(c.absenceDeduction)}</td>
            <td>${formatNumber(deductions)}</td>
            <td>${formatNumber(c.net)}</td>
        </tr>`;
    });

    const html = `
    <div class="salary-print">
        <div class="header">
            ${settings.companyLogo ? `<div class="logo"><img src="${settings.companyLogo}"></div>` : ''}
            <h2>${companyNameHTML(displayCompanyName())}</h2>
            <p>${settings.companyAddress || ''} ${settings.companyPhone ? '| ' + t('هاتف: ') + settings.companyPhone : ''}</p>
        </div>
        <h2 style="text-align:center">ملخص رواتب فرع: ${branchName(branch)}</h2>
        <p style="text-align:center"><strong>الشهر: ${monthName} ${year} | عدد الموظفين: ${branchEmps.length}</strong></p>
        <table>
            <thead>
                <tr>
                    <th>م</th>
                    <th>اسم الموظف</th>
                    <th>الراتب الأساسي</th>
                    <th>خصم الغياب</th>
                    <th>الخصومات</th>
                    <th>الصافي</th>
                </tr>
            </thead>
            <tbody>${rows}
                <tr style="font-weight:bold">
                    <td colspan="2" style="text-align:center"><strong>الإجمالي</strong></td>
                    <td>${formatNumber(totals.base)}</td>
                    <td>${formatNumber(totals.absence)}</td>
                    <td>${formatNumber(totals.deductions)}</td>
                    <td><strong>${formatNumber(totals.net)}</strong></td>
                </tr>
            </tbody>
        </table>
        <div class="print-footer">طبعت بواسطة أبو يوسف</div>
    </div>`;

    const printArea = document.getElementById('print-salary-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';
    document.title = 'قسم الحسابات';
    sweepText(document.body);
    const nativePrinting = printWithNative('ملخص رواتب الفرع');
    if (!nativePrinting) {
        window.print();
        printArea.style.display = 'none';
        printArea.innerHTML = '';
    }
    document.title = t('نظام إدارة الرواتب');
}

// ==================== كشف الرواتب ====================
function getSalaryData(year, month, branchFilter, searchText) {
    const data = [];
    employees.forEach(emp => {
        if (!employeeActiveInPeriod(emp, year, month)) return;
        if (branchFilter && emp.branch !== branchFilter) return;
        if (searchText && !emp.name.includes(searchText)) return;
        const calc = calcEmployeeSalary(emp, year, month);
        data.push({emp: emp, calc: calc});
    });
    return data;
}

function getBranchSalaryReceiptBatch() {
    const year = Number(document.getElementById('salary-receipt-year').value);
    const month = Number(document.getElementById('salary-receipt-month').value);
    const branch = document.getElementById('salary-receipt-branch').value;
    const scopedEmployees = branch
        ? employees.filter(function(emp) {
            return emp.branch === branch && employeeActiveInPeriod(emp, year, month);
        })
        : [];
    const employeeIds = new Set(scopedEmployees.map(function(emp) { return emp.id; }));
    const scopedNotes = notes.filter(function(note) {
        return employeeIds.has(note.employeeId) && noteMatchesPeriod(note, year, month);
    });
    const scopedVouchers = vouchers.filter(function(voucher) {
        return employeeIds.has(voucher.employeeId) && salaryVoucherMatchesPeriod(voucher, voucher.employeeId, year, month);
    });
    const rows = scopedEmployees.map(function(emp) {
        const calc = calcEmployeeSalary(emp, year, month);
        const employeeVouchers = getSalaryVouchersForPeriod(emp.id, year, month);
        const due = Math.max(0, Math.round(calc.net));
        return {
            emp: emp,
            calc: calc,
            due: due,
            paid: employeeVouchers.reduce(function(sum, voucher) {
                return sum + Math.round(Number(voucher.amount) || 0);
            }, 0),
            hasVoucher: employeeVouchers.length > 0
        };
    });
    const candidates = rows.filter(function(row) { return row.due > 0; });
    const paid = rows.reduce(function(sum, row) { return sum + row.paid; }, 0);
    const due = candidates.reduce(function(sum, row) { return sum + row.due; }, 0);
    const signature = JSON.stringify({
        branch: branch,
        year: year,
        month: month,
        employees: scopedEmployees,
        notes: scopedNotes,
        vouchers: scopedVouchers,
        settings: settings
    });
    return {
        branch: branch,
        year: year,
        month: month,
        rows: rows,
        candidates: candidates,
        paid: paid,
        due: due,
        signature: signature
    };
}

function buildSalaryReceiptVoucher(row, batch, id, paymentMethod, date) {
    return {
        id: id,
        type: 'payment',
        isSalary: true,
        employeeId: row.emp.id,
        externalName: '',
        amount: row.due,
        reason: '',
        paymentMethod: paymentMethod,
        date: date,
        month: batch.month,
        year: batch.year
    };
}

function getSavedBranchSalaryReceiptVouchers(branch, year, month) {
    return vouchers.filter(function(voucher) {
        if (!voucher || !voucher.isSalary || voucher.type !== 'payment') return false;
        if (!salaryVoucherMatchesPeriod(voucher, voucher.employeeId, year, month)) return false;
        const employee = getEmployeeById(voucher.employeeId);
        return employee && employee.branch === branch;
    }).slice().sort(function(first, second) {
        return (Number(first.id) || 0) - (Number(second.id) || 0);
    });
}

function renderBranchSalaryReceiptReprintActions() {
    const container = document.getElementById('salary-receipt-reprint-branches');
    if (!container) return;

    const availableBranches = getBranches();
    container.replaceChildren();
    if (availableBranches.length === 0) {
        const emptyMessage = document.createElement('span');
        emptyMessage.className = 'salary-receipt-reprint-empty';
        emptyMessage.textContent = 'لا توجد فروع مسجلة لإعادة الطباعة.';
        container.appendChild(emptyMessage);
        return;
    }

    availableBranches.forEach(function(branch) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary salary-receipt-reprint-btn';
        button.dataset.branch = branch;
        button.title = 'إعادة طباعة سندات الرواتب المحفوظة لفرع ' + branchName(branch);
        button.setAttribute('aria-label', 'إعادة طباعة سندات الرواتب المحفوظة لفرع ' + branchName(branch));
        button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M7 3h7l5 5v13H7z"></path>' +
            '<path d="M14 3v5h5M10 13h6M10 17h6"></path>' +
            '<path d="M4 7v14h12"></path></svg><span></span>';
        button.querySelector('span').textContent = branchName(branch);
        container.appendChild(button);
    });
}

function buildBranchSalaryReceiptPrintHTML(savedVouchers) {
    return savedVouchers.map(function(voucher, index) {
        return '<section class="salary-receipt-page' +
            (index === savedVouchers.length - 1 ? ' is-last' : '') + '">' +
            '<div class="salary-receipt-page-label">إيصال ' + formatNumber(index + 1) +
            ' من ' + formatNumber(savedVouchers.length) + '</div>' +
            buildVoucherHTML(voucher) + '</section>';
    }).join('');
}

function printBranchSalaryReceiptVouchers(savedVouchers, branch, year, month, nativeJobName) {
    let printArea = document.getElementById('print-salary-vouchers-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'print-salary-vouchers-area';
        printArea.className = 'print-area';
        document.body.appendChild(printArea);
    }
    printArea.innerHTML = buildBranchSalaryReceiptPrintHTML(savedVouchers);

    const previousTitle = document.title;
    const jobName = 'سندات رواتب ' + branchName(branch) + ' - ' +
        getMonthName(month) + ' ' + year;
    document.title = jobName;
    try {
        if (!printWithNative(nativeJobName || jobName)) window.print();
    } finally {
        document.title = previousTitle;
    }
}

function reprintBranchSalaryReceipts(branch) {
    const year = Number(document.getElementById('salary-receipt-year').value);
    const month = Number(document.getElementById('salary-receipt-month').value);
    if (!branch || !getBranches().includes(branch)) {
        alert('يرجى اختيار فرع صحيح لإعادة الطباعة.');
        return;
    }

    const savedVouchers = getSavedBranchSalaryReceiptVouchers(branch, year, month);
    if (savedVouchers.length === 0) {
        const message = 'لا توجد سندات رواتب محفوظة ومعتمدة لفرع ' + branchName(branch) +
            ' خلال ' + getMonthName(month) + ' ' + year + '.';
        document.getElementById('salary-receipt-feedback').textContent = message;
        alert(message);
        return;
    }

    document.getElementById('salary-receipt-feedback').textContent =
        'إعادة طباعة ' + formatNumber(savedVouchers.length) + ' سنداً محفوظاً لفرع ' +
        branchName(branch) + '. لم يتم إنشاء أو تعديل أي سند.';
    try {
        printBranchSalaryReceiptVouchers(savedVouchers, branch, year, month);
    } catch (printError) {
        console.error('تعذر فتح شاشة إعادة طباعة سندات الرواتب', printError);
        alert('تعذر فتح شاشة الطباعة. لم يتم تعديل السندات المحفوظة؛ حاول مرة أخرى.');
    }
}

function refreshBranchSalaryReceipts() {
    const tbody = document.getElementById('salary-receipt-tbody');
    if (!tbody) return;
    refreshSalaryReceiptBranchChoices();
    renderBranchSalaryReceiptReprintActions();

    const dateInput = document.getElementById('salary-receipt-date');
    if (dateInput && !dateInput.value) dateInput.value = localDateKey(new Date());

    const batch = getBranchSalaryReceiptBatch();
    const approveButton = document.getElementById('salary-receipt-approve');
    document.getElementById('salary-receipt-employees').textContent = formatNumber(batch.rows.length);
    document.getElementById('salary-receipt-due').innerHTML = formatNumber(batch.due) + ' <small>درهم</small>';
    document.getElementById('salary-receipt-paid').innerHTML = formatNumber(batch.paid) + ' <small>درهم</small>';
    document.getElementById('salary-receipt-pages').textContent = formatNumber(batch.candidates.length);
    approveButton.disabled = batch.candidates.length === 0;

    if (!batch.branch) {
        tbody.innerHTML = '<tr><td colspan="6" class="salary-receipt-empty">اختر فرعاً لعرض الرواتب الحالية.</td></tr>';
        document.getElementById('salary-receipt-feedback').textContent = getBranches().length
            ? 'اختر فرعاً لعرض الرواتب الحالية.'
            : 'لا توجد فروع أو موظفون مسجلون حالياً.';
        document.getElementById('salary-receipt-preview').textContent = 'اختر فرعاً لعرض نموذج الإيصال.';
        document.getElementById('salary-receipt-preview-count').textContent = 'لا توجد صفحات للمعاينة';
        return;
    }

    let candidateIndex = 0;
    tbody.innerHTML = batch.rows.map(function(row, index) {
        let status;
        let pageLabel = '—';
        if (row.due > 0) {
            candidateIndex++;
            status = '<span class="salary-receipt-status is-due">مستحق للصرف</span>';
            pageLabel = 'صفحة ' + formatNumber(candidateIndex) + ' من ' + formatNumber(batch.candidates.length);
        } else if (row.calc.net < 0) {
            status = '<span class="salary-receipt-status is-negative">لا يوجد مستحق — الخصومات تتجاوز الصافي</span>';
        } else if (row.hasVoucher) {
            status = '<span class="salary-receipt-status is-paid">تم الصرف</span>';
        } else {
            status = '<span class="salary-receipt-status is-neutral">لا يوجد مبلغ مستحق</span>';
        }
        return '<tr><td>' + formatNumber(index + 1) + '</td>' +
            '<td><strong>' + empName(row.emp) + '</strong><small>رقم الموظف: ' + row.emp.id + '</small></td>' +
            '<td>' + (row.emp.position || '—') + '</td>' +
            '<td class="amount ' + (row.due > 0 ? 'is-amount-due' : row.calc.net < 0 ? 'is-amount-negative' : '') + '">' + formatNumber(row.calc.net) + ' درهم</td>' +
            '<td>' + status + '</td>' +
            '<td>' + pageLabel + '</td></tr>';
    }).join('');

    if (batch.rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="salary-receipt-empty">لا يوجد موظفون نشطون في هذا الفرع خلال الفترة المحددة.</td></tr>';
    }

    const feedback = document.getElementById('salary-receipt-feedback');
    if (batch.candidates.length > 0) {
        feedback.textContent = 'المعاينة محدثة: ' + formatNumber(batch.candidates.length) +
            ' إيصالات مستحقة بمجموع ' + formatNumber(batch.due) + ' درهم. سيتم إنشاء صفحة مستقلة لكل موظف.';
    } else if (batch.rows.length === 0) {
        feedback.textContent = 'لا يوجد موظفون نشطون في هذا الفرع خلال الفترة المحددة.';
    } else if (batch.paid > 0) {
        feedback.textContent = 'لا توجد مبالغ متبقية للصرف في هذه الفترة. تم تسجيل السندات السابقة؛ لا يمكن إعادة صرفها.';
    } else {
        feedback.textContent = 'لا توجد رواتب مستحقة للصرف في هذا الفرع خلال الفترة المحددة.';
    }

    const preview = document.getElementById('salary-receipt-preview');
    const previewCount = document.getElementById('salary-receipt-preview-count');
    if (batch.candidates.length > 0) {
        const previewVoucher = buildSalaryReceiptVoucher(
            batch.candidates[0],
            batch,
            Math.max(Number(nextVoucherId) || 1, vouchers.reduce(function(maximum, voucher) {
                return Math.max(maximum, Number(voucher.id) || 0);
            }, 0) + 1),
            document.getElementById('salary-receipt-method').value,
            dateInput.value
        );
        preview.innerHTML = buildVoucherHTML(previewVoucher);
        previewCount.textContent = 'صفحة ١ من ' + formatNumber(batch.candidates.length);
    } else {
        preview.textContent = 'لا توجد إيصالات مستحقة للمعاينة.';
        previewCount.textContent = 'لا توجد صفحات للمعاينة';
    }
    postRender();
}

let salaryReceiptCommitInProgress = false;

function confirmAndPrintBranchSalaryReceipts() {
    if (salaryReceiptCommitInProgress) return;
    const previewBatch = getBranchSalaryReceiptBatch();
    refreshBranchSalaryReceipts();
    if (!previewBatch.branch) {
        alert('يرجى اختيار الفرع أولاً');
        return;
    }
    if (previewBatch.candidates.length === 0) {
        alert('لا توجد مبالغ مستحقة للصرف في هذا الفرع خلال الفترة المحددة.');
        return;
    }

    const paymentMethod = document.getElementById('salary-receipt-method').value;
    const date = document.getElementById('salary-receipt-date').value;
    if (!date) {
        alert('يرجى تحديد تاريخ السداد');
        return;
    }
    const confirmation = 'سيتم تسجيل صرف ' + previewBatch.candidates.length + ' موظفاً بمبلغ إجمالي ' +
        formatNumber(previewBatch.due) + ' درهم، ثم فتح مستند الطباعة (' +
        previewBatch.candidates.length + ' صفحات A4). هل تريد المتابعة؟';
    if (!confirm(confirmation)) return;

    const currentBatch = getBranchSalaryReceiptBatch();
    if (currentBatch.signature !== previewBatch.signature ||
        currentBatch.candidates.length !== previewBatch.candidates.length ||
        currentBatch.due !== previewBatch.due) {
        refreshBranchSalaryReceipts();
        alert('تغيرت بيانات الرواتب بعد المعاينة. تم تحديثها؛ راجع المبالغ ثم أعد التأكيد.');
        return;
    }
    if (currentBatch.candidates.some(function(row) {
        return getSalaryVouchersForPeriod(row.emp.id, currentBatch.year, currentBatch.month).length > 0 &&
            !previewBatch.rows.find(function(previous) { return previous.emp.id === row.emp.id; }).hasVoucher;
    })) {
        refreshBranchSalaryReceipts();
        alert('تم تسجيل سند راتب أثناء المعاينة. حدّث البيانات قبل إعادة المحاولة.');
        return;
    }

    salaryReceiptCommitInProgress = true;
    const oldNextVoucherId = nextVoucherId;
    const highestVoucherId = vouchers.reduce(function(maximum, voucher) {
        return Math.max(maximum, Number(voucher.id) || 0);
    }, 0);
    let nextId = Math.max(Number(nextVoucherId) || 1, highestVoucherId + 1);
    const createdVouchers = currentBatch.candidates.map(function(row) {
        return buildSalaryReceiptVoucher(row, currentBatch, nextId++, paymentMethod, date);
    });
    let previousVouchersValue;
    let previousCounterValue;
    let storageSnapshotRead = false;
    const updatedVouchers = vouchers.concat(createdVouchers);
    try {
        previousVouchersValue = localStorage.getItem(STORAGE_KEYS.vouchers);
        previousCounterValue = localStorage.getItem(STORAGE_KEYS.vouchersCounter);
        storageSnapshotRead = true;
        localStorage.setItem(STORAGE_KEYS.vouchersCounter, String(nextId));
        localStorage.setItem(STORAGE_KEYS.vouchers, JSON.stringify(updatedVouchers));
    } catch (error) {
        if (storageSnapshotRead) {
            try {
                if (previousVouchersValue === null) localStorage.removeItem(STORAGE_KEYS.vouchers);
                else localStorage.setItem(STORAGE_KEYS.vouchers, previousVouchersValue);
            } catch (rollbackError) {
                console.error('تعذر التراجع عن قائمة سندات الرواتب', rollbackError);
            }
            try {
                if (previousCounterValue === null) localStorage.removeItem(STORAGE_KEYS.vouchersCounter);
                else localStorage.setItem(STORAGE_KEYS.vouchersCounter, previousCounterValue);
            } catch (rollbackError) {
                console.error('تعذر التراجع عن عداد السندات', rollbackError);
            }
        }
        nextVoucherId = oldNextVoucherId;
        salaryReceiptCommitInProgress = false;
        alert('تعذر حفظ سندات الرواتب. لم يتم اعتماد الصرف؛ تحقق من مساحة التخزين ثم أعد المحاولة.');
        return;
    }

    vouchers = updatedVouchers;
    nextVoucherId = nextId;
    try {
        pushToCloud();
    } catch (syncError) {
        console.error('تعذر بدء مزامنة دفعة سندات الرواتب', syncError);
        setCloudStatus(false, 'تم الحفظ محلياً - تعذرت المزامنة');
    }
    loadVouchers();
    refreshSalarySheet();
    refreshBranchSalaryReceipts();
    document.getElementById('salary-receipt-feedback').textContent =
        'تم حفظ واعتماد ' + formatNumber(createdVouchers.length) + ' سند راتب. يمكنك حفظ المستند PDF من شاشة الطباعة.';

    try {
        printBranchSalaryReceiptVouchers(
            createdVouchers,
            currentBatch.branch,
            currentBatch.year,
            currentBatch.month,
            'سندات رواتب ' + branchName(currentBatch.branch)
        );
    } catch (printError) {
        console.error('تعذر فتح شاشة الطباعة بعد اعتماد الصرف', printError);
        alert('تم اعتماد الصرف وحفظ السندات، لكن تعذر فتح شاشة الطباعة. يمكنك المحاولة مجدداً من السندات المحفوظة.');
    } finally {
        salaryReceiptCommitInProgress = false;
    }
}

function refreshSalarySheet() {
    const year = parseInt(document.getElementById('salary-year').value);
    const month = parseInt(document.getElementById('salary-month').value);
    const branch = document.getElementById('salary-branch-filter').value;
    const search = document.getElementById('salary-search').value.trim();

    populateBranchFilters();

    const data = getSalaryData(year, month, branch, search);
    const tbody = document.getElementById('salary-tbody');
    const tfoot = document.getElementById('salary-tfoot');

    tbody.innerHTML = '';
    let totalBase = 0, totalAbsence = 0, totalDed = 0, totalNet = 0;

    data.forEach((item, idx) => {
        const emp = item.emp;
        const c = item.calc;
        totalBase += c.baseSalary;
        totalAbsence += c.absenceDeduction;
        totalDed += c.otherDeductions + c.notesDeductions + c.salaryVoucherDeduction;
        totalNet += c.net;

        const notesCount = notes.filter(n => n.employeeId === emp.id && noteMatchesPeriod(n, year, month)).length;
        const hasSalaryVoucher = getSalaryVouchersForPeriod(emp.id, year, month).length > 0;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${empName(emp)}${c.leaveDays > 0 ? ' <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(52,152,219,0.15);color:#1a5276;font-size:11px;font-weight:bold">' + t('إجازة') + '</span>' : ''}</td>
            <td>${branchName(emp.branch)}</td>
            <td class="amount">${formatNumber(c.baseSalary)}</td>
            <td class="amount">${formatNumber(c.absenceDeduction)}</td>
            <td class="amount" style="cursor:pointer;text-decoration:underline;color:#1a5276" title="اضغط لعرض تفاصيل الخصومات" onclick="showSalaryDeductions(${emp.id}, ${year}, ${month})">${formatNumber(c.otherDeductions + c.notesDeductions + c.salaryVoucherDeduction)}</td>
            <td class="amount" style="font-weight:bold;color:${c.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatNumber(c.net)}</td>
            <td>
                <button class="btn btn-info btn-sm" onclick="showNotesModal(${emp.id})">ملاحظات (${notesCount})</button>
            </td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showSalaryVoucher(${emp.id}, ${year}, ${month})"${c.net <= 0 && !hasSalaryVoucher ? ' disabled title="لا يوجد راتب مستحق"' : ''}>سند راتب</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tfoot.innerHTML = `
        <tr>
            <td colspan="3" style="text-align:center;font-weight:bold">الإجمالـــي</td>
            <td class="amount">${formatNumber(totalBase)}</td>
            <td class="amount">${formatNumber(totalAbsence)}</td>
            <td class="amount">${formatNumber(totalDed)}</td>
            <td class="amount">${formatNumber(totalNet)}</td>
            <td colspan="2"></td>
        </tr>
    `;
    postRender();
}

function showSalaryDeductions(empId, year, month) {
    const emp = getEmployeeById(empId);
    if (!emp) return;
    const c = calcEmployeeSalary(emp, year, month);
    const notesForEmp = notes.filter(n => n.employeeId === empId && noteMatchesPeriod(n, year, month));
    const monthName = getMonthName(month);

    document.getElementById('deductions-modal-title').textContent = t('تفاصيل الخصومات: ') + empName(emp) + ' - ' + monthName + ' ' + year;

    let rows = '';
    let total = 0;

    if (c.absenceDeduction > 0) {
        rows += `<tr><td>خصم الغياب</td><td class="amount">${formatNumber(c.absenceDeduction)}</td></tr>`;
        total += c.absenceDeduction;
    }
    if (c.otherDeductions > 0) {
        rows += `<tr><td>خصومات أخرى</td><td class="amount">${formatNumber(c.otherDeductions)}</td></tr>`;
        total += c.otherDeductions;
    }
    if (c.salaryVoucherDeduction > 0) {
        rows += `<tr><td>سندات راتب مصروفة</td><td class="amount">${formatNumber(c.salaryVoucherDeduction)}</td></tr>`;
        total += c.salaryVoucherDeduction;
    }

    notesForEmp.forEach(note => {
        if (note.amount < 0) {
            const typeName = noteTypeText(note.type);
            rows += `<tr><td>${typeName} - ${noteDisplayText(note) || ''}</td><td class="amount">${formatNumber(Math.abs(note.amount))}</td></tr>`;
            total += Math.abs(note.amount);
        }
    });

    if (!rows) {
        rows = '<tr><td colspan="2" style="text-align:center;color:var(--text-light);padding:25px">لا توجد خصومات</td></tr>';
    } else {
        rows += `<tr style="font-weight:bold;background:#f0f0f0"><td>الإجمـالي</td><td class="amount">${formatNumber(total)}</td></tr>`;
    }

    document.getElementById('deductions-tbody').innerHTML = rows;
    document.getElementById('deductions-modal').style.display = 'flex';
    postRender();
}

function closeDeductionsModal() {
    document.getElementById('deductions-modal').style.display = 'none';
}

function printSalarySheet() {
    const year = parseInt(document.getElementById('salary-year').value);
    const month = parseInt(document.getElementById('salary-month').value);
    const branch = document.getElementById('salary-branch-filter').value;
    const search = document.getElementById('salary-search').value.trim();

    const data = getSalaryData(year, month, branch, search);
    const monthName = getMonthName(month);
    const branchDisplay = branch ? branchName(branch) : t('جميع الفروع');

    let rows = '';
    let totalBase = 0, totalDed = 0, totalNet = 0;

    data.forEach((item, idx) => {
        const emp = item.emp;
        const c = item.calc;
        if (c.leaveDays >= daysInMonth(year, month)) return;
        totalBase += c.baseSalary;
        totalDed += c.totalDeductions;
        totalNet += c.net;
        rows += `<tr>
            <td>${idx + 1}</td>
            <td>${empName(emp)}</td>
            <td>${branchName(emp.branch)}</td>
            <td>${formatNumber(c.baseSalary)}</td>
            <td>${formatNumber(c.totalDeductions)}</td>
            <td>${formatNumber(c.net)}</td>
        </tr>`;
    });

    const html = `
    <div class="salary-print">
        <div class="header">
            ${settings.companyLogo ? `<div class="logo"><img src="${settings.companyLogo}"></div>` : ''}
            <h2>${companyNameHTML(displayCompanyName())}</h2>
            <p>${settings.companyAddress || ''} ${settings.companyPhone ? '| ' + t('هاتف: ') + settings.companyPhone : ''}</p>
        </div>
        <h2 style="text-align:center">
            كشف الرواتب الشهري المختصر للموظفين
        </h2>
        <p style="text-align:center"><strong>الشهر: ${monthName} ${year} | الفرع: ${branchDisplay}</strong></p>
        <table>
            <thead>
                <tr>
                    <th>م</th>
                    <th>اسم الموظف</th>
                    <th>الفرع</th>
                    <th>الراتب الأساسي</th>
                    <th>إجمالي الخصومات</th>
                    <th>الراتب المستحق</th>
                </tr>
            </thead>
            <tbody>${rows}
                <tr style="font-weight:bold">
                    <td colspan="3" style="text-align:center"><strong>الإجمـــــالي</strong></td>
                    <td>${formatNumber(totalBase)}</td>
                    <td>${formatNumber(totalDed)}</td>
                    <td>${formatNumber(totalNet)}</td>
                </tr>
            </tbody>
        </table>
        <div class="print-footer">طبعت بواسطة أبو يوسف</div>
    </div>`;

    const printArea = document.getElementById('print-salary-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';
    document.title = 'قسم الحسابات';
    sweepText(document.body);
    const nativePrinting = printWithNative('كشف الرواتب الشهري');
    if (!nativePrinting) {
        window.print();
        printArea.style.display = 'none';
    }
    document.title = t('نظام إدارة الرواتب');
}

// ==================== كشف الأجور المستحقة (بعد خصم الغياب فقط) ====================
function printSalaryWages() {
    const year = parseInt(document.getElementById('salary-year').value);
    const month = parseInt(document.getElementById('salary-month').value);
    const branch = document.getElementById('salary-branch-filter').value;
    const monthName = getMonthName(month);
    const branchDisplay = branch ? branchName(branch) : t('جميع الفروع');

    const data = getSalaryData(year, month, branch, '');

    let rows = '';
    let totalSalary = 0;
    data.forEach((item, idx) => {
        const emp = item.emp;
        const c = item.calc;
        if (c.leaveDays >= daysInMonth(year, month)) return;
        const salary = c.baseSalary - c.absenceDeduction;
        totalSalary += salary;
        rows += `<tr>
            <td>${idx + 1}</td>
            <td>${emp.id}</td>
            <td>${empName(emp)}</td>
            <td>${formatNumber(salary)}</td>
        </tr>`;
    });

    const html = `
    <div class="salary-print">
        <div class="header">
            ${settings.companyLogo ? `<div class="logo"><img src="${settings.companyLogo}"></div>` : ''}
            <h2>${companyNameHTML(displayCompanyName())}</h2>
            <p>${settings.companyAddress || ''} ${settings.companyPhone ? '| ' + t('هاتف: ') + settings.companyPhone : ''}</p>
        </div>
        <h2 style="text-align:center">
            كشف الأجور المستحقة (الراتب الأساسي بعد خصم الغياب فقط)
        </h2>
        <p style="text-align:center"><strong>الشهر: ${monthName} ${year} | الفرع: ${branchDisplay}</strong></p>
        <p style="text-align:center; font-size:13px; margin:6px 0 14px">
            هذا الكشف يوضح مستحقات الرواتب بعد خصم الغياب فقط؛ لا تُخصم منه سندات الرواتب المعتمدة أو المصروفة أو السلف أو الخصومات الأخرى.
        </p>
        <table>
            <thead>
                <tr>
                    <th>م</th>
                    <th>رقم الموظف</th>
                    <th>اسم الموظف</th>
                    <th>الراتب</th>
                </tr>
            </thead>
            <tbody>${rows}
                <tr style="font-weight:bold">
                    <td colspan="3" style="text-align:center"><strong>الإجمـــــالي</strong></td>
                    <td>${formatNumber(totalSalary)}</td>
                </tr>
            </tbody>
        </table>
        <div class="print-footer">طبعت بواسطة أبو يوسف</div>
    </div>`;

    const printArea = document.getElementById('print-salary-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';
    document.title = 'قسم الحسابات';
    sweepText(document.body);
    const nativePrinting = printWithNative('كشف الأجور');
    if (!nativePrinting) {
        window.print();
        printArea.style.display = 'none';
    }
    document.title = t('نظام إدارة الرواتب');
}

// ==================== إدارة الموظفين ====================
function refreshEmployees() {
    const search = document.getElementById('employee-search').value.trim();
    const tbody = document.getElementById('employees-tbody');
    tbody.innerHTML = '';

    const filtered = search ? employees.slice().filter(e => e.name.includes(search)) : employees.slice();

    filtered.forEach((emp, idx) => {
        const ln = getLeaveNote(emp.id);
        const now = new Date(); now.setHours(0,0,0,0);
        const isOnLeave = !!ln && !ln.leaveCancelled && (!ln.leaveTo || parseDateKey(ln.leaveTo) >= now);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${emp.id}</td>
            <td>${empName(emp)}${isOnLeave ? ' <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:rgba(52,152,219,0.15);color:#1a5276;font-size:11px;font-weight:bold;margin-right:4px">' + t('إجازة سنوية') + '</span>' : ''}</td>
            <td class="amount">${formatNumber(emp.baseSalary)}</td>
            <td>${branchName(emp.branch)}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showEmployeeModal(${emp.id})">${t('تعديل')}</button>
                <button class="btn btn-danger btn-sm" onclick="deleteEmployee(${emp.id})">${t('حذف')}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
    postRender();
}

function filterEmployees() {
    refreshEmployees();
}

const employeeModal = document.getElementById('employee-modal');
let currentEmployeeId = null;

function showEmployeeModal(id) {
    currentEmployeeId = id || null;
    document.getElementById('employee-modal-title').textContent = id ? 'تعديل موظف' : 'إضافة موظف';
    document.getElementById('emp-id').value = id || '';
    document.getElementById('emp-id').disabled = !!id;

    if (id) {
        const emp = getEmployeeById(id);
        document.getElementById('emp-name').value = emp.name;
        document.getElementById('emp-branch').value = emp.branch;
        document.getElementById('emp-position').value = emp.position || '';
        document.getElementById('emp-start-date').value = emp.employmentStartDate || '';
        document.getElementById('emp-salary').value = emp.baseSalary;
        document.getElementById('emp-absences').value = emp.absences;
        document.getElementById('emp-other-deductions').value = emp.otherDeductions;
    } else {
        document.getElementById('emp-name').value = '';
        document.getElementById('emp-branch').value = '';
        document.getElementById('emp-position').value = '';
        document.getElementById('emp-start-date').value = localDateKey(new Date());
        document.getElementById('emp-salary').value = '';
        document.getElementById('emp-absences').value = '0';
        document.getElementById('emp-other-deductions').value = '0';
    }

    document.getElementById('employee-modal').style.display = 'flex';
}

function closeEmployeeModal() {
    document.getElementById('employee-modal').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('employee-form')) {
        document.getElementById('employee-form').addEventListener('submit', function(e) {
            e.preventDefault();
            const name = document.getElementById('emp-name').value.trim();
            const branch = document.getElementById('emp-branch').value.trim();
            const position = document.getElementById('emp-position').value.trim();
            const employmentStartDate = document.getElementById('emp-start-date').value;
            const salary = Math.round(parseFloat(document.getElementById('emp-salary').value) || 0);
            const absences = parseFloat(document.getElementById('emp-absences').value) || 0;
            const otherDeductions = Math.round(parseFloat(document.getElementById('emp-other-deductions').value) || 0);

            if (!name || !branch) { alert('يرجى إدخال اسم الموظف والفرع'); return; }
            if (!currentEmployeeId && !employmentStartDate) { alert('يرجى تحديد تاريخ التعيين / التسجيل'); return; }
            if (employmentStartDate && !parseDateKey(employmentStartDate)) { alert('يرجى إدخال تاريخ تعيين صحيح'); return; }

            if (currentEmployeeId) {
                const emp = getEmployeeById(currentEmployeeId);
                emp.name = name;
                emp.branch = branch;
                emp.position = position;
                if (employmentStartDate) emp.employmentStartDate = employmentStartDate;
                else delete emp.employmentStartDate;
                emp.baseSalary = salary;
                emp.absences = absences;
                emp.otherDeductions = otherDeductions;
            } else {
                const newId = parseInt(document.getElementById('emp-id').value);
                if (!newId || isNaN(newId) || newId < 1) { alert('يرجى إدخال الرقم الوظيفي بشكل صحيح'); return; }
                if (employees.some(e => e.id === newId)) { alert('الرقم الوظيفي ' + newId + ' مستخدم بالفعل'); return; }
                clearDeletion('employees', newId);
                employees.push({
                    id: newId, name, branch, position,
                    employmentStartDate,
                    baseSalary: salary,
                    absences, otherDeductions
                });
            }

            saveData();
            sortEmployeesById();
            closeEmployeeModal();
            refreshEmployees();
            refreshSalarySheet();
            populateBranchFilters();
            refreshBranches();
            postRender();
        });
    }
});

function deleteEmployee(id) {
    if (!confirm('هل أنت متأكد من حذف هذا الموظف؟')) return;
    recordDeletion('employees', id);
    notes.filter(n => n.employeeId === id).forEach(function(note) {
        recordDeletion('notes', note.id);
    });
    employees = employees.filter(e => e.id !== id);
    notes = notes.filter(n => n.employeeId !== id);
    saveData();
    refreshEmployees();
    refreshSalarySheet();
    populateBranchFilters();
    refreshBranches();
    postRender();
}

// استيراد من Excel
function importEmployeesFromExcel() {
    document.getElementById('import-excel-file').click();
}

document.addEventListener('DOMContentLoaded', function() {
    const importInput = document.getElementById('import-excel-file');
    if (importInput) {
        importInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    const data = new Uint8Array(event.target.result);
                    const workbook = XLSX.read(data, {type: 'array'});
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, {header: 1});

                    let imported = 0;
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length < 2) continue;
                        const rowId = String(row[0] || '').trim();
                        const name = String(row[1] || '').trim();
                        const branch = String(row[2] || '').trim();
                        if (!name || !branch) continue;
                        const salary = Math.round(parseFloat(String(row[3] || '0').replace(/[^\d.-]/g, '')) || 0);
                        const position = String(row[5] || '').trim();

                        let empId = parseInt(rowId);
                        if (!empId || isNaN(empId) || empId < 1 || employees.some(e => e.id === empId)) {
                            empId = employees.length > 0 ? Math.max(...employees.map(e => e.id)) + 1 : 1;
                            while (employees.some(e => e.id === empId)) empId++;
                        }
                        employees.push({
                            id: empId, name, branch, position,
                            employmentStartDate: localDateKey(new Date()),
                            baseSalary: salary,
                            absences: 0, otherDeductions: 0
                        });
                        imported++;
                    }

                    saveData();
                    refreshEmployees();
                    refreshSalarySheet();
                    populateBranchFilters();
                    refreshBranches();
                    alert('تم استيراد ' + imported + ' موظف بنجاح');
                } catch(err) {
                    alert('خطأ في قراءة الملف: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    }
});

// تصدير إلى Excel
function exportEmployeesToExcel() {
    const ws_data = [
        ['رقم وظيفي', 'اسم الموظف', 'الفرع', 'الراتب الأساسي', 'المنصب']
    ];
    employees.forEach(emp => {
        ws_data.push([emp.id, emp.name, emp.branch, emp.baseSalary, emp.position || '']);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الموظفين');
    XLSX.writeFile(wb, 'الموظفين.xlsx');
}

function exportSalaryToExcel() {
    const year = parseInt(document.getElementById('salary-year').value);
    const month = parseInt(document.getElementById('salary-month').value);
    const branch = document.getElementById('salary-branch-filter').value;
    const search = document.getElementById('salary-search').value.trim();
    const data = getSalaryData(year, month, branch, search);

    const ws_data = [
        ['م', 'اسم الموظف', 'الفرع', 'الراتب الأساسي', 'خصم الغياب', 'الخصومات', 'الصافي']
    ];
    data.forEach((item, idx) => {
        const emp = item.emp;
        const c = item.calc;
        ws_data.push([idx+1, emp.name, emp.branch, emp.baseSalary, Math.round(c.absenceDeduction), Math.round(c.otherDeductions + c.notesDeductions + c.salaryVoucherDeduction), Math.round(c.net)]);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'كشف الرواتب');
    XLSX.writeFile(wb, `كشف_الرواتب_${getMonthName(month)}_${year}.xlsx`);
}

// ==================== الملاحظات ====================
let currentNotesEmployeeId = null;
let currentNotesYear = null;
let currentNotesMonth = null;

function showNotesModal(empId) {
    currentNotesEmployeeId = empId;
    const emp = getEmployeeById(empId);
    currentNotesYear = parseInt(document.getElementById('salary-year').value);
    currentNotesMonth = parseInt(document.getElementById('salary-month').value);

    document.getElementById('notes-modal-title').textContent = t('ملاحظات: ') + empName(emp) + ' - جميع الفترات';
    refreshNotesTable();
    document.getElementById('notes-modal').style.display = 'flex';
    postRender();
}

function refreshNotesTable() {
    const tbody = document.getElementById('notes-tbody');
    tbody.innerHTML = '';
    if (!currentNotesEmployeeId) return;

    const empNotes = notes
        .filter(n => n.employeeId === currentNotesEmployeeId)
        .sort((a, b) => {
            const dateA = a.type === 'leave' && a.leaveFrom ? a.leaveFrom : reportDateForNote(a);
            const dateB = b.type === 'leave' && b.leaveFrom ? b.leaveFrom : reportDateForNote(b);
            return dateB.localeCompare(dateA) || Number(b.id) - Number(a.id);
        });

    empNotes.forEach(note => {
        const tr = document.createElement('tr');
        const isDeduction = note.amount < 0;
        const leaveFinished = note.type === 'leave' && note.leaveCancelled;
        const typeName = noteTypeText(note.type);
        const isOtherNote = note.type === 'other';
        const badgeBg = leaveFinished || isOtherNote ? 'rgba(127,140,141,0.15)' : (isDeduction ? 'rgba(231,76,60,0.12)' : 'rgba(39,174,96,0.12)');
        const badgeColor = leaveFinished || isOtherNote ? '#7f8c8d' : (isDeduction ? 'var(--danger)' : 'var(--success)');
        const noteDate = note.type === 'absence' && note.absenceFrom
            ? formatVoucherDate(note.absenceFrom) + (note.absenceTo && note.absenceTo !== note.absenceFrom ? ' — ' + formatVoucherDate(note.absenceTo) : '')
            : note.type === 'leave' && note.leaveFrom
                ? formatVoucherDate(note.leaveFrom) + (note.leaveTo ? ' — ' + formatVoucherDate(note.leaveTo) : ' (مستمرة)')
                : formatVoucherDate(reportDateForNote(note));
        tr.innerHTML = `
            <td>${noteDate}</td>
            <td><span style="display:inline-block; padding:2px 8px; border-radius:4px; background:${badgeBg}; color:${badgeColor}; font-size:11px; font-weight:bold; margin-left:6px">${typeName}</span>${noteDisplayText(note)}</td>
            <td class="amount" style="color:${isDeduction ? 'var(--danger)' : 'var(--success)'}">
                ${note.type === 'leave' || isOtherNote ? '—' : formatNumber(Math.abs(note.amount)) + (isDeduction ? ' (' + t('خصم') + ')' : '')}
            </td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="startEditNote(${note.id})">${t('تعديل')}</button>
                ${note.type === 'leave' && !leaveFinished ? `<button class="btn btn-secondary btn-sm" onclick="finishLeave(${note.id})">${t('إنهاء الإجازة')}</button>` : ''}
                <button class="btn btn-danger btn-sm" onclick="deleteNote(${note.id})">${t('حذف')}</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (empNotes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:30px">' + t('لا توجد ملاحظات') + '</td></tr>';
    }
    postRender();
}

function closeNotesModal() {
    document.getElementById('notes-modal').style.display = 'none';
    refreshSalarySheet();
}

function addEmployeeNote() {
    document.getElementById('note-type').value = 'deduction';
    document.getElementById('note-absence-slot').value = 'full';
    document.getElementById('note-absence-from').value = '';
    document.getElementById('note-absence-to').value = '';
    document.getElementById('note-absence-reason').value = '';
    document.getElementById('note-leave-from').value = '';
    document.getElementById('note-leave-to').value = '';
    document.getElementById('note-text').value = '';
    document.getElementById('note-text').readOnly = false;
    document.getElementById('note-amount').value = '0';
    populateNoteDaySelect();
    handleNoteTypeChange();
    document.getElementById('add-note-modal').style.display = 'flex';
    postRender();
}

function handleNoteTypeChange() {
    const type = document.getElementById('note-type').value;
    const absenceGroup = document.getElementById('note-absence-group');
    const leaveGroup = document.getElementById('note-leave-group');
    const textGroup = document.getElementById('note-text-group');
    const amountGroup = document.getElementById('note-amount-group');
    const advanceHint = document.getElementById('note-advance-hint');
    const text = document.getElementById('note-text');
    const textLabel = document.getElementById('note-text-label');
    const amountLabel = document.getElementById('note-amount-label');

    absenceGroup.style.display = type === 'absence' ? 'block' : 'none';
    leaveGroup.style.display = type === 'leave' ? 'block' : 'none';
    textGroup.style.display = (type === 'absence' || type === 'leave') ? 'none' : 'block';
    amountGroup.style.display = (type === 'absence' || type === 'leave' || type === 'other') ? 'none' : 'block';
    advanceHint.style.display = 'none';

    if (type === 'advance') {
        text.value = 'سلفة من الراتب';
        text.readOnly = true;
        translateLabel(textLabel, 'السبب');
        translateLabel(amountLabel, 'مبلغ السلفة');
        advanceHint.style.display = 'block';
    } else if (type === 'deduction') {
        text.value = '';
        text.readOnly = false;
        translateLabel(textLabel, 'سبب الخصم');
        translateLabel(amountLabel, 'المبلغ');
    } else if (type === 'other') {
        text.value = '';
        text.readOnly = false;
        translateLabel(textLabel, 'الملاحظة');
    }

    updateAbsenceCalc();
}

function parseDateKey(s) {
    if (!s) return null;
    const p = String(s).split('-');
    return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
}

// عدد أيام الغياب ضمن الشهر المحدد بين تاريخين
function absenceDaysInMonth(fromStr, toStr, year, month) {
    const from = parseDateKey(fromStr);
    const to = parseDateKey(toStr);
    if (!from || !to) return 0;
    if (to < from) return 0;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const start = from < monthStart ? new Date(monthStart) : new Date(from);
    const end = to > monthEnd ? new Date(monthEnd) : new Date(to);
    const days = Math.round((end - start) / 86400000) + 1;
    return days > 0 ? days : 0;
}

function absenceSlotLabel(slot) {
    return slot === 'start' ? 'بداية دوام' : slot === 'end' ? 'نهاية دوام' : 'غياب كامل';
}

function absenceSlotText(slot) {
    return slot === 'start' ? 'غياب بداية دوام' : slot === 'end' ? 'غياب نهاية دوام' : 'غياب';
}

function getLeaveNote(empId) {
    return notes.find(n => n.type === 'leave' && n.employeeId === empId);
}

// عدد أيام الإجازة السنوية الواقعة ضمن الشهر المحدد
function leaveDaysInMonth(emp, year, month) {
    const ln = getLeaveNote(emp.id);
    if (!ln) return 0;
    const from = parseDateKey(ln.leaveFrom);
    if (!from) return 0;
    if (from > new Date(year, month, 0)) return 0;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    if (ln.leaveTo && parseDateKey(ln.leaveTo) < monthStart) return 0;
    const start = from < monthStart ? new Date(monthStart) : new Date(from);
    const endDate = ln.leaveTo ? parseDateKey(ln.leaveTo) : null;
    const end = !endDate || endDate > monthEnd ? new Date(monthEnd) : new Date(endDate);
    const days = Math.round((end - start) / 86400000) + 1;
    return days > 0 ? days : 0;
}

function onFullLeave(emp, year, month) {
    return leaveDaysInMonth(emp, year, month) >= daysInMonth(year, month);
}

function leaveWorkDays(emp, year, month) {
    const total = daysInMonth(year, month);
    return Math.max(0, total - leaveDaysInMonth(emp, year, month));
}

function finishLeave(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    const year = currentNotesYear;
    const month = currentNotesMonth;
    const lastDay = new Date(year, month, 0).getDate();
    const defaultEnd = new Date(year, month - 1, lastDay).toISOString().slice(0, 10);
    const val = prompt('تاريخ انتهاء الإجازة (اليوم الأخير لا يُحتسب راتباً):', defaultEnd);
    if (!val) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) { alert('التنسيق يجب أن يكون YYYY-MM-DD'); return; }
    if (note.leaveFrom && parseDateKey(val) < parseDateKey(note.leaveFrom)) { alert('تاريخ الانتهاء قبل بداية الإجازة'); return; }
    note.leaveTo = val;
    note.leaveCancelled = true;
    note.text = 'إجازة سنوية من ' + formatVoucherDate(note.leaveFrom) + ' إلى ' + formatVoucherDate(val);
    saveData();
    refreshNotesTable();
    refreshSalarySheet();
    refreshBranches();
    alert('تم إنهاء الإجازة — سيُحسب الراتب من اليوم التالي لتاريخ الانتهاء');
}

function updateAbsenceCalc() {
    const result = document.getElementById('note-absence-result');
    const daysLabel = document.getElementById('note-absence-days-label');
    if (!result) return;
    result.textContent = '';
    if (!daysLabel) return;
    if (!currentNotesEmployeeId) { daysLabel.textContent = ''; return; }

    const emp = getEmployeeById(currentNotesEmployeeId);
    const year = currentNotesYear;
    const month = currentNotesMonth;
    const fromStr = document.getElementById('note-absence-from').value;
    const toStr = document.getElementById('note-absence-to').value;

    if (!fromStr || !toStr) {
        translateLabel(daysLabel, 'أدخل تاريخي البداية والنهاية');
        return;
    }
    if (parseDateKey(toStr) < parseDateKey(fromStr)) {
        translateLabel(daysLabel, 'تاريخ النهاية قبل البداية');
        return;
    }

    const days = absenceDaysInMonth(fromStr, toStr, year, month);
    if (days <= 0) {
        translateLabel(daysLabel, 'لا توجد أيام غياب في الشهر المحدد');
        return;
    }

    translateLabel(daysLabel, 'عدد أيام الغياب: ' + formatAbsenceDays(days));
    const daysInM = daysInMonth(year, month);
    const calc = Math.round((emp.baseSalary / daysInM) * days);
    translateLabel(result, 'قيمة الخصم: ' + formatNumber(calc) + ' ' + t('درهم'));
}

function translateLabel(el, ar) {
    if (!el) return;
    el.textContent = ar;
}

function populateNoteDaySelect() {
    const year = currentNotesYear;
    const month = currentNotesMonth;
    const days = daysInMonth(year, month);
    const sel = document.getElementById('note-day');
    sel.innerHTML = '';
    for (let d = 1; d <= days; d++) {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = 'يوم ' + d;
        sel.appendChild(opt);
    }
}

function startEditNote(noteId) {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    if (!reportEditPreviousPeriod) {
        notesEditPreviousPeriod = {year: currentNotesYear, month: currentNotesMonth};
        currentNotesYear = Number(note.year) || currentNotesYear;
        currentNotesMonth = Number(note.month) || currentNotesMonth;
    }
    editNoteId = noteId;
    const type = note.type || 'deduction';
    document.getElementById('note-type').value = type;
    document.getElementById('note-amount').value = Math.abs(note.amount);
    document.getElementById('note-absence-slot').value = note.absenceSlot || 'full';
    document.getElementById('note-absence-from').value = note.absenceFrom || '';
    document.getElementById('note-absence-to').value = note.absenceTo || '';
    document.getElementById('note-absence-reason').value = note.absenceReason || '';
    document.getElementById('note-leave-from').value = note.type === 'leave' ? (note.leaveFrom || '') : '';
    document.getElementById('note-leave-to').value = note.type === 'leave' ? (note.leaveTo || '') : '';
    document.getElementById('note-text').value = note.text || '';
    document.getElementById('note-text').readOnly = (type === 'advance' || type === 'leave');
    populateNoteDaySelect();
    document.getElementById('note-day').value = note.day;
    handleNoteTypeChange();
    if (type !== 'advance' && type !== 'leave') {
        document.getElementById('note-text').value = note.text || '';
        document.getElementById('note-text').readOnly = false;
    }
    document.getElementById('add-note-modal').style.display = 'flex';
    postRender();
}

let editNoteId = null;
let reportEditPreviousPeriod = null;
let notesEditPreviousPeriod = null;

function startEditReportNote(noteId) {
    const note = notes.find(function(item) { return item.id === noteId; });
    if (!note) return;

    const yearSelect = document.getElementById('salary-year');
    const monthSelect = document.getElementById('salary-month');
    reportEditPreviousPeriod = {
        year: yearSelect.value,
        month: monthSelect.value,
        notesYear: currentNotesYear,
        notesMonth: currentNotesMonth
    };
    currentNotesEmployeeId = note.employeeId;
    const noteYear = String(note.year);
    if (!Array.from(yearSelect.options).some(function(option) { return option.value === noteYear; })) {
        const option = document.createElement('option');
        option.value = noteYear;
        option.textContent = noteYear;
        yearSelect.appendChild(option);
    }
    yearSelect.value = noteYear;
    monthSelect.value = String(note.month);
    currentNotesYear = Number(note.year);
    currentNotesMonth = Number(note.month);
    startEditNote(note.id);
}

function closeAddNoteModal() {
    document.getElementById('add-note-modal').style.display = 'none';
    editNoteId = null;
    if (reportEditPreviousPeriod) {
        document.getElementById('salary-year').value = reportEditPreviousPeriod.year;
        document.getElementById('salary-month').value = reportEditPreviousPeriod.month;
        currentNotesYear = reportEditPreviousPeriod.notesYear;
        currentNotesMonth = reportEditPreviousPeriod.notesMonth;
        reportEditPreviousPeriod = null;
    } else if (notesEditPreviousPeriod) {
        currentNotesYear = notesEditPreviousPeriod.year;
        currentNotesMonth = notesEditPreviousPeriod.month;
        notesEditPreviousPeriod = null;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const noteForm = document.getElementById('note-form');
    if (noteForm) {
        noteForm.addEventListener('submit', function(e) {
            e.preventDefault();
            if (!currentNotesEmployeeId) return;

            const year = currentNotesYear;
            const month = currentNotesMonth;
            const day = parseInt(document.getElementById('note-day').value);
            const type = document.getElementById('note-type').value;
            const emp = getEmployeeById(currentNotesEmployeeId);

            let amount = 0;
            let text = '';
            let absenceDays = 0;
            let absenceFrom = '';
            let absenceTo = '';
            let absenceReason = '';
            let absenceSlot = 'full';
            let noteLeaveFrom = '';
            let noteLeaveTo = '';

            if (type === 'absence') {
                const fromStr = document.getElementById('note-absence-from').value;
                const toStr = document.getElementById('note-absence-to').value;
                if (!fromStr || !toStr) { alert('يرجى إدخال تاريخي بداية ونهاية الغياب'); return; }
                if (parseDateKey(toStr) < parseDateKey(fromStr)) { alert('تاريخ النهاية قبل تاريخ البداية'); return; }
                absenceDays = absenceDaysInMonth(fromStr, toStr, year, month);
                if (absenceDays <= 0) { alert('لا توجد أيام غياب ضمن الشهر المحدد'); return; }
                const days = daysInMonth(year, month);
                amount = -Math.round((emp.baseSalary / days) * absenceDays);
                const reason = document.getElementById('note-absence-reason').value.trim();
                absenceSlot = document.getElementById('note-absence-slot').value;
                text = absenceSlotText(absenceSlot) + ' من ' + formatVoucherDate(fromStr) + ' إلى ' + formatVoucherDate(toStr) + (reason ? ' - ' + reason : '');
                absenceFrom = fromStr;
                absenceTo = toStr;
                absenceReason = reason;
            } else if (type === 'leave') {
                noteLeaveFrom = document.getElementById('note-leave-from').value;
                noteLeaveTo = document.getElementById('note-leave-to').value;
                if (!noteLeaveFrom) { alert('يرجى تحديد بداية الإجازة'); return; }
                if (noteLeaveTo && parseDateKey(noteLeaveTo) < parseDateKey(noteLeaveFrom)) { alert('نهاية الإجازة قبل بدايتها'); return; }
                const existingLeave = getLeaveNote(currentNotesEmployeeId);
                if (existingLeave && existingLeave.id !== editNoteId) { alert('لهذا الموظف إجازة سنوية مسجلة بالفعل — أنهِها أو احذفها أولاً'); return; }
                if (editNoteId) {
                    const existing = notes.find(n => n.id === editNoteId);
                    if (existing && existing.leaveCancelled) { alert('هذه الإجازة منتهية — يمكنك التعديل فقط على الحقول'); }
                }
                amount = 0;
                text = 'إجازة سنوية من ' + formatVoucherDate(noteLeaveFrom) + (noteLeaveTo ? ' إلى ' + formatVoucherDate(noteLeaveTo) : ' (مستمرة)');
            } else {
                text = document.getElementById('note-text').value.trim();
                if (type === 'other') {
                    if (!text) { alert('يرجى كتابة الملاحظة'); return; }
                } else {
                    const raw = Math.round(parseFloat(document.getElementById('note-amount').value) || 0);
                    if (raw <= 0) { alert('يرجى إدخال مبلغ صحيح أكبر من صفر'); return; }
                    amount = -raw;
                    if (type === 'deduction' && !text) { alert('يرجى ذكر سبب الخصم'); return; }
                }
            }

            let createdVoucher = null;

            if (editNoteId) {
                const note = notes.find(n => n.id === editNoteId);
                if (note) {
                    note.year = year;
                    note.month = month;
                    note.day = day;
                    note.type = type;
                    note.text = text;
                    note.amount = amount;
                    if (type === 'absence') {
                        note.absenceDays = absenceDays;
                        note.absenceFrom = absenceFrom;
                        note.absenceTo = absenceTo;
                        note.absenceReason = absenceReason;
                        note.absenceSlot = absenceSlot;
                    } else if (type === 'leave') {
                        note.leaveFrom = noteLeaveFrom;
                        note.leaveTo = noteLeaveTo;
                        note.day = 1;
                    } else {
                        delete note.absenceDays;
                        delete note.absenceFrom;
                        delete note.absenceTo;
                        delete note.absenceReason;
                        delete note.absenceSlot;
                        delete note.leaveFrom;
                        delete note.leaveTo;
                    }
                }
            } else {
                const newId = getNextNoteId();
                const noteObj = {id: newId, employeeId: currentNotesEmployeeId, year, month, day, type, text, amount};
                if (type === 'absence') {
                    noteObj.absenceDays = absenceDays;
                    noteObj.absenceFrom = absenceFrom;
                    noteObj.absenceTo = absenceTo;
                    noteObj.absenceReason = absenceReason;
                    noteObj.absenceSlot = absenceSlot;
                } else if (type === 'leave') {
                    noteObj.leaveFrom = noteLeaveFrom;
                    noteObj.leaveTo = noteLeaveTo;
                    noteObj.leaveCancelled = false;
                    noteObj.day = 1;
                }
                notes.push(noteObj);

                if (type === 'advance') {
                    const vId = getNextVoucherId();
                    createdVoucher = {
                        id: vId,
                        type: 'payment',
                        isSalary: false,
                        isAdvance: true,
                        employeeId: currentNotesEmployeeId,
                        externalName: '',
                        amount: Math.abs(amount),
                        reason: 'سلفة من الراتب',
                        paymentMethod: 'cash',
                        date: year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
                    };
                    vouchers.push(createdVoucher);
                }
            }

            saveData();
            closeAddNoteModal();
            refreshNotesTable();
            refreshSalarySheet();
            populateBranchFilters();
            refreshBranches();
            refreshAbsenceDeductionReport();

            if (createdVoucher) {
                showVoucherPreview(createdVoucher);
            }
        });
    }
});

function deleteNote(noteId) {
    if (!confirm('هل أنت متأكد من حذف هذه الملاحظة؟')) return;
    recordDeletion('notes', noteId);
    notes = notes.filter(n => n.id !== noteId);
    saveData();
    refreshNotesTable();
    refreshSalarySheet();
    refreshAbsenceDeductionReport();
}

// ==================== السندات ====================
const ARABIC_NUMBERS = ['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر','عشرون','واحد وعشرون','اثنان وعشرون','ثلاثة وعشرون','أربعة وعشرون','خمسة وعشرون','ستة وعشرون','سبعة وعشرون','ثمانية وعشرون','تسعة وعشرون','ثلاثون','واحد وثلاثون','اثنان وثلاثون','ثلاثة وثلاثون','أربعة وثلاثون','خمسة وثلاثون','ستة وثلاثون','سبعة وثلاثون','ثمانية وثلاثون','تسعة وثلاثون','أربعون','واحد وأربعون','اثنان وأربعون','ثلاثة وأربعون','أربعة وأربعون','خمسة وأربعون','ستة وأربعون','سبعة وأربعون','ثمانية وأربعون','تسعة وأربعون','خمسون','واحد وخمسون','اثنان وخمسون','ثلاثة وخمسون','أربعة وخمسون','خمسة وخمسون','ستة وخمسون','سبعة وخمسون','ثمانية وخمسون','تسعة وخمسون','ستون','واحد وستون','اثنان وستون','ثلاثة وستون','أربعة وستون','خمسة وستون','ستة وستون','سبعة وستون','ثمانية وستون','تسعة وستون','سبعون','واحد وسبعون','اثنان وسبعون','ثلاثة وسبعون','أربعة وسبعون','خمسة وسبعون','ستة وسبعون','سبعة وسبعون','ثمانية وسبعون','تسعة وسبعون','ثمانون','واحد وثمانون','اثنان وثمانون','ثلاثة وثمانون','أربعة وثمانون','خمسة وثمانون','ستة وثمانون','سبعة وثمانون','ثمانية وثمانون','تسعة وثمانون','تسعون','واحد وتسعون','اثنان وتسعون','ثلاثة وتسعون','أربعة وتسعون','خمسة وتسعون','ستة وتسعون','سبعة وتسعون','ثمانية وتسعون','تسعة وتسعون'];

function numberToArabicWords(num) {
    num = Math.round(num);
    if (num === 0) return 'صفر';
    if (num <= 99) return ARABIC_NUMBERS[num] || String(num);
    if (num < 1000) {
        const hundreds = Math.floor(num / 100);
        const remainder = num % 100;
        const hundredsMap = {1:'مائة',2:'مائتان',3:'ثلاثمائة',4:'أربعمائة',5:'خمسمائة',6:'ستمائة',7:'سبعمائة',8:'ثمانمائة',9:'تسعمائة'};
        return hundredsMap[hundreds] + (remainder > 0 ? ' و' + numberToArabicWords(remainder) : '');
    }
    if (num < 1000000) {
        const thousands = Math.floor(num / 1000);
        const remainder = num % 1000;
        const thousandsWord = thousands === 1 ? 'ألف' : (thousands === 2 ? 'ألفان' : numberToArabicWords(thousands) + ' ألف');
        return thousandsWord + (remainder > 0 ? ' و' + numberToArabicWords(remainder) : '');
    }
    return String(num);
}


function formatVoucherNumber(num) {
    return String(num).padStart(4, '0');
}

function formatVoucherDate(dateStr) {
    const parts = String(dateStr || '').split('-');
    if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return dateStr || '';
}

function getVoucherRecipientName(voucher) {
    if (voucher.employeeId) {
        const emp = getEmployeeById(voucher.employeeId);
        if (emp) return empName(emp);
    }
    return voucher.externalName || 'مستفيد';
}

function buildVoucherHTML(voucher) {
    const isSalary = voucher.isSalary;
    const isPayment = voucher.type === 'payment';
    let title = isPayment ? t('سند صرف') : t('سند قبض');
    if (isSalary) title = t('سند صرف');

    const recipientName = getVoucherRecipientName(voucher);
    let recipientId = '';
    if (voucher.employeeId) {
        const emp = getEmployeeById(voucher.employeeId);
        if (emp) {
            recipientId = emp.id;
        }
    } else if (voucher.externalName) {
        recipientId = null;
    }

    const dateStr = formatVoucherDate(voucher.date);
    const methodName = getPaymentMethodName(voucher.paymentMethod) || t('نقداً');
    const amountWords = numberToArabicWords(voucher.amount);
    const amountFiller = 'درهم إماراتي فقط لا غير - ';
    const reasonText = isSalary ? '' : (voucher.reason || '');
    const showEmployeeId = (isSalary || voucher.isAdvance) && recipientId;

    return `
    <div class="voucher-wrap">
    <div class="voucher-print">
        <div class="voucher-top">
            <div class="voucher-top-name">${companyNameHTML(displayCompanyName())}</div>
            <div class="voucher-top-logo">${settings.companyLogo ? `<img src="${settings.companyLogo}">` : ''}</div>
            <div class="voucher-top-num">رقم السند<div><strong style="color:#1a5276">${formatVoucherNumber(voucher.id)}</strong></div></div>
        </div>
        <div class="voucher-divider"></div>

        <div class="voucher-headline">
            <div class="voucher-amount-side">
                <span class="voucher-amount-label">المبلغ</span>
                <span class="voucher-amount-box">${formatNumber(voucher.amount)}</span>
                <span class="voucher-amount-currency">درهم</span>
            </div>
            <span class="voucher-booktitle ${isPayment ? 'voucher-title-payment' : 'voucher-title-receipt'}">${title}</span>
            ${dateStr ? `<span class="voucher-dategroup">التاريخ: <strong style="color:#1a5276">${dateStr}</strong></span>` : '<span></span>'}
        </div>

        <div class="voucher-payee-row">
            <span class="voucher-payee-label">${isPayment ? 'يصرف للسيد /' : 'استلمنا من السيد /'}</span>
            <span class="voucher-payee-name">${recipientName}</span>
        </div>

        <div class="voucher-text-row">
            <span class="voucher-row-label">مبلغ وقدره /</span>
            <span class="voucher-row-value">${amountWords} ${amountFiller}<strong style="color:#000">${methodName}</strong></span>
        </div>

        <div class="voucher-text-row">
            <span class="voucher-row-label">وذلك مقابل /</span>
            <span class="voucher-row-value">${reasonText || ''}</span>
        </div>

        <div class="voucher-sign-row">
            <div class="voucher-sign-item">
                <span>توقيع المحاسب</span>
                ${settings.accountantSignature ? `<img class="voucher-sign-img" src="${settings.accountantSignature}">` : `<span class="voucher-sign-dots"></span>`}
            </div>
            <div class="voucher-sign-item">
                <span>توقيع المستلم</span>
                ${voucher.recipientSignature ? `<img class="voucher-sign-img" src="${voucher.recipientSignature}" alt="توقيع المستلم">` : `<span class="voucher-sign-dots"></span>`}
            </div>
        </div>

        </div>
        ${showEmployeeId ? `<div class="voucher-employee-id">${recipientId}</div>` : ''}
        <div class="print-footer">طبعت بواسطة أبو يوسف</div>
    </div>`;
}

function refreshVoucherPage() {
    populateBranchFilters();
    const voucherBranchSel = document.getElementById('salary-voucher-branch');
    if (voucherBranchSel) {
        voucherBranchSel.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'جميع الفروع';
        voucherBranchSel.appendChild(allOpt);
        getBranches().forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            voucherBranchSel.appendChild(opt);
        });
    }

    const empSel = document.getElementById('voucher-employee-select');
    if (empSel) {
        empSel.innerHTML = '';
        employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.id + ' - ' + empName(e) + ' - ' + branchName(e.branch);
            empSel.appendChild(opt);
        });
    }

    const salaryEmpSel = document.getElementById('salary-voucher-employee-select');
    if (salaryEmpSel) {
        salaryEmpSel.innerHTML = '';
        employees.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.id + ' - ' + empName(e) + ' - ' + branchName(e.branch);
            salaryEmpSel.appendChild(opt);
        });
    }

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('voucher-date').value = today;
    document.getElementById('salary-voucher-date').value = today;

    onVoucherTypeChange();

    // ربط طريقة السداد في صفحة السندات
    const recipientType = document.getElementById('voucher-recipient-type');
    if (recipientType) {
        recipientType.onchange = function() {
            const isEmployee = this.value === 'employee';
            document.getElementById('voucher-employee-group').style.display = isEmployee ? 'block' : 'none';
            document.getElementById('voucher-external-group').style.display = isEmployee ? 'none' : 'block';
        };
    }
}

function createVoucher() {
    const type = document.getElementById('voucher-type').value;
    const recipientType = document.getElementById('voucher-recipient-type').value;
    const employeeId = recipientType === 'employee' ? parseInt(document.getElementById('voucher-employee-select').value) : null;
    const externalName = recipientType === 'external' ? document.getElementById('voucher-external-name').value.trim() : '';
    const amount = Math.round(parseFloat(document.getElementById('voucher-amount').value) || 0);
    const reason = document.getElementById('voucher-reason').value.trim();
    const paymentMethod = document.getElementById('voucher-payment-method').value;
    const date = document.getElementById('voucher-date').value;

    if (!amount || amount <= 0) { alert('يرجى إدخال المبلغ'); return; }
    if (!employeeId && !externalName) { alert('يرجى تحديد المستفيد'); return; }

    const newId = getNextVoucherId();
    vouchers.push({
        id: newId,
        type: type,
        isSalary: false,
        employeeId: employeeId,
        externalName: externalName,
        amount: amount,
        reason: reason,
        paymentMethod: paymentMethod,
        date: date
    });

    saveData();
    loadVouchers();

    // عرض فوري لطباعة السند
    const created = vouchers.find(v => v.id === newId);
    showVoucherPreview(created);

    document.getElementById('voucher-amount').value = '';
    document.getElementById('voucher-reason').value = '';
    document.getElementById('voucher-external-name').value = '';
}

function generateSalaryVouchers() {
    const year = parseInt(document.getElementById('salary-voucher-year').value);
    const month = parseInt(document.getElementById('salary-voucher-month').value);
    const branch = document.getElementById('salary-voucher-branch').value;
    const paymentMethod = document.getElementById('salary-voucher-method').value;
    const date = document.getElementById('salary-voucher-date').value;

    if (!confirm('هل أنت متأكد من إنشاء سندات صرف رواتب؟')) return;

    let filteredEmps = employees.filter(e => (!branch || e.branch === branch) && employeeActiveInPeriod(e, year, month));
    let created = 0;

    filteredEmps.forEach(emp => {
        if (getSalaryVouchersForPeriod(emp.id, year, month).length > 0) return;
        const calc = calcEmployeeSalary(emp, year, month);
        if (calc.net <= 0) return;

        const newId = getNextVoucherId();
        vouchers.push({
            id: newId,
            type: 'payment',
            isSalary: true,
            employeeId: emp.id,
            externalName: '',
            amount: Math.round(calc.net),
            reason: '', // سبب الصرف فارغ لسندات الرواتب
            paymentMethod: paymentMethod,
            date: date,
            month: month,
            year: year
        });
        created++;
    });

    saveData();
    loadVouchers();
    refreshSalarySheet();
    if (confirm('تم إنشاء ' + created + ' سند صرف بنجاح.\nهل تريد طباعة سندات موظفي الفرع الآن؟')) {
        printAllSalaryVouchers();
    }
}

function filterVoucherEmployees() {
    const search = document.getElementById('voucher-employee-search').value.trim().toLowerCase();
    const empSel = document.getElementById('voucher-employee-select');
    const filtered = search
        ? employees.filter(e => e.name.toLowerCase().includes(search) || String(e.id).includes(search))
        : employees;
    empSel.innerHTML = '';
    filtered.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.id + ' - ' + empName(e) + ' - ' + branchName(e.branch);
        empSel.appendChild(opt);
    });
    postRender();
}

function onVoucherTypeChange() {
    const type = document.getElementById('voucher-type').value;
    const isSalary = type === 'salary';
    document.getElementById('voucher-normal-section').style.display = isSalary ? 'none' : '';
    document.getElementById('voucher-salary-section').style.display = isSalary ? '' : 'none';
    if (isSalary) onSalaryVoucherTargetChange();
}

function onSalaryVoucherTargetChange() {
    const target = document.getElementById('salary-voucher-target').value;
    document.getElementById('salary-voucher-employee-picker').style.display = target === 'employee' ? 'block' : 'none';
    document.getElementById('salary-voucher-branch-picker').style.display = target === 'branch' ? 'block' : 'none';
}

function filterSalaryVoucherEmployee() {
    const search = document.getElementById('salary-voucher-employee-search').value.trim().toLowerCase();
    const empSel = document.getElementById('salary-voucher-employee-select');
    const filtered = search
        ? employees.filter(e => e.name.toLowerCase().includes(search) || String(e.id).includes(search))
        : employees;
    empSel.innerHTML = '';
    filtered.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id;
        opt.textContent = e.id + ' - ' + empName(e) + ' - ' + branchName(e.branch);
        empSel.appendChild(opt);
    });
    postRender();
}

function generateSingleSalaryVoucher() {
    const empSel = document.getElementById('salary-voucher-employee-select');
    if (!empSel.value) { alert('يرجى اختيار موظف'); return; }

    const empId = parseInt(empSel.value);
    const year = parseInt(document.getElementById('salary-voucher-year').value);
    const month = parseInt(document.getElementById('salary-voucher-month').value);
    const paymentMethod = document.getElementById('salary-voucher-method').value;
    const date = document.getElementById('salary-voucher-date').value;

    const emp = getEmployeeById(empId);
    const existingVoucher = getSalaryVouchersForPeriod(empId, year, month)[0];
    if (existingVoucher) {
        showVoucherPreview(existingVoucher);
        return;
    }
    const calc = calcEmployeeSalary(emp, year, month);
    if (calc.net <= 0) {
        alert('لا يوجد مبلغ مستحق لإصدار سند راتب لهذا الموظف في الشهر المحدد');
        return;
    }

    const newId = getNextVoucherId();
    const voucher = {
        id: newId,
        type: 'payment',
        isSalary: true,
        employeeId: empId,
        externalName: '',
        amount: Math.round(calc.net),
        reason: '',
        paymentMethod: paymentMethod,
        date: date,
        month: month,
        year: year
    };
    vouchers.push(voucher);
    saveData();
    loadVouchers();
    refreshSalarySheet();
    showVoucherPreview(voucher);
}

function loadVouchers() {
    const filter = document.getElementById('saved-voucher-filter').value;
    const tbody = document.getElementById('vouchers-list');
    tbody.innerHTML = '';

    let filtered = vouchers.slice().sort((a, b) => b.id - a.id);

    if (filter === 'payment') filtered = filtered.filter(v => v.type === 'payment');
    if (filter === 'collection') filtered = filtered.filter(v => v.type === 'collection');
    if (filter === 'salary') filtered = filtered.filter(v => v.isSalary);

    filtered.forEach((voucher, idx) => {
        let recipient = voucher.externalName;
        if (voucher.employeeId) {
            const emp = getEmployeeById(voucher.employeeId);
            recipient = emp ? empName(emp) : t('موظف');
        }
        const isPayment = voucher.type === 'payment';
        const title = voucher.isSalary ? t('سند راتب') : (isPayment ? t('صرف') : t('قبض'));

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${voucher.id}</td>
            <td>
                <span class="badge ${isPayment ? 'badge-danger' : 'badge-success'}">${title}</span>
            </td>
            <td>${recipient}</td>
            <td class="amount">${formatNumber(voucher.amount)}</td>
            <td>${voucher.isSalary ? '—' : (voucher.reason || '')}</td>
            <td>${getPaymentMethodName(voucher.paymentMethod)}</td>
            <td>${voucher.date}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="showVoucherPreview(${voucher.id})">طباعة</button>
                <button class="btn btn-secondary btn-sm" onclick="editVoucher(${voucher.id})">تعديل</button>
                <button class="btn btn-danger btn-sm" onclick="deleteVoucher(${voucher.id})">حذف</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:30px">' + t('لا توجد سندات') + '</td></tr>';
    }
    postRender();
}

function showSalaryVoucher(empId, year, month) {
    const existingVoucher = getSalaryVouchersForPeriod(empId, year, month)[0];
    if (existingVoucher) {
        showVoucherPreview(existingVoucher);
        return;
    }
    const emp = getEmployeeById(empId);
    if (!emp) return;
    const calc = calcEmployeeSalary(emp, year, month);
    if (calc.net <= 0) {
        alert('لا يوجد مبلغ مستحق لإصدار سند راتب لهذا الموظف في الشهر المحدد');
        return;
    }

    const newId = getNextVoucherId();
    const voucher = {
        id: newId,
        type: 'payment',
        isSalary: true,
        employeeId: empId,
        externalName: '',
        amount: Math.round(calc.net),
        reason: '',
        paymentMethod: 'cash',
        date: `${year}-${String(month).padStart(2,'0')}-15`,
        month: month,
        year: year
    };
    showVoucherPreview(voucher);
}

function printAllSalaryVouchers() {
    const year = parseInt(document.getElementById('salary-voucher-year').value);
    const month = parseInt(document.getElementById('salary-voucher-month').value);
    const branch = document.getElementById('salary-voucher-branch').value;
    const paymentMethod = document.getElementById('salary-voucher-method').value;
    const date = document.getElementById('salary-voucher-date').value;

    const empList = employees.filter(e => (!branch || e.branch === branch) && employeeActiveInPeriod(e, year, month) && !onFullLeave(e, year, month));

    const salaryVouchers = [];
    let createdVouchers = false;
    empList.forEach(emp => {
        const savedVoucher = getSalaryVouchersForPeriod(emp.id, year, month)[0];
        const calc = calcEmployeeSalary(emp, year, month);
        if (savedVoucher && calc.net + calc.salaryVoucherDeduction <= 0) return;
        if (!savedVoucher && calc.net <= 0) return;
        const voucher = savedVoucher || {
            id: getNextVoucherId(),
            type: 'payment',
            isSalary: true,
            employeeId: emp.id,
            externalName: '',
            amount: Math.round(calc.net),
            reason: '',
            paymentMethod: paymentMethod,
            date: date,
            month: month,
            year: year
        };
        if (!savedVoucher) {
            vouchers.push(voucher);
            createdVouchers = true;
        }
        salaryVouchers.push(voucher);
    });

    if (createdVouchers) {
        saveData();
        loadVouchers();
        refreshSalarySheet();
    }

    let html = '';
    salaryVouchers.forEach((voucher, idx) => {
        html += `<div style="page-break-after:${idx < salaryVouchers.length - 1 ? 'always' : 'auto'}">`;
        html += buildVoucherHTML(voucher);
        html += '</div>';
    });

    let printArea = document.getElementById('print-salary-vouchers-area');
    if (!printArea) {
        printArea = document.createElement('div');
        printArea.id = 'print-salary-vouchers-area';
        document.body.appendChild(printArea);
    }
    printArea.style.display = 'block';
    printArea.innerHTML = html;

    sweepText(document.body);
    document.title = 'قسم الحسابات';
    const nativePrinting = printWithNative('سندات الرواتب');
    if (!nativePrinting) {
        window.print();
        printArea.remove();
    }
    document.title = t('نظام إدارة الرواتب');
}

function showVoucherPreview(voucherIdOrObj) {
    let voucher;
    if (typeof voucherIdOrObj === 'number') {
        voucher = vouchers.find(v => v.id === voucherIdOrObj);
    } else {
        voucher = voucherIdOrObj;
    }
    if (!voucher) return;
    if (!canIssueSalaryVoucher(voucher)) return;

    const html = buildVoucherHTML(voucher);
    document.getElementById('print-voucher-content').innerHTML = html;
    document.getElementById('print-voucher-modal').style.display = 'flex';
    currentPrintVoucher = voucher;
    prepareRecipientSignature(voucher.recipientSignature || '');
    postRender();
}

let currentPrintVoucher = null;
let signatureCanvasContext = null;
let signatureDrawing = false;
let signatureHasInk = false;
let signatureRestorePending = false;
let signaturePadRevision = 0;

function initializeRecipientSignaturePad() {
    const canvas = document.getElementById('recipient-signature-canvas');
    if (!canvas) return;

    signatureCanvasContext = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', function(event) {
        event.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        signaturePadRevision++;
        signatureRestorePending = false;
        signatureDrawing = true;
        signatureHasInk = true;
        canvas.setPointerCapture(event.pointerId);
        signatureCanvasContext.beginPath();
        signatureCanvasContext.moveTo(x, y);
        signatureCanvasContext.lineTo(x + 0.1, y + 0.1);
        signatureCanvasContext.stroke();
        signatureCanvasContext.beginPath();
        signatureCanvasContext.moveTo(x, y);
    });
    canvas.addEventListener('pointermove', function(event) {
        if (!signatureDrawing) return;
        const rect = canvas.getBoundingClientRect();
        signatureCanvasContext.lineTo(event.clientX - rect.left, event.clientY - rect.top);
        signatureCanvasContext.stroke();
        signatureCanvasContext.beginPath();
        signatureCanvasContext.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function(eventName) {
        canvas.addEventListener(eventName, function() { signatureDrawing = false; });
    });
}

function prepareRecipientSignature(signature) {
    const canvas = document.getElementById('recipient-signature-canvas');
    const status = document.getElementById('recipient-signature-status');
    if (!canvas || !signatureCanvasContext) return;
    const revision = ++signaturePadRevision;
    const capacitor = window.Capacitor;
    const isAndroid = capacitor && typeof capacitor.getPlatform === 'function' && capacitor.getPlatform() === 'android';

    const width = Math.max(1, canvas.clientWidth);
    const height = 140;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    signatureCanvasContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    signatureCanvasContext.clearRect(0, 0, width, height);
    signatureCanvasContext.lineWidth = 2.4;
    signatureCanvasContext.lineCap = 'round';
    signatureCanvasContext.lineJoin = 'round';
    signatureCanvasContext.strokeStyle = isAndroid ? '#1557C0' : '#17202a';
    signatureDrawing = false;
    signatureHasInk = Boolean(signature);
    signatureRestorePending = Boolean(signature);
    status.textContent = '';

    if (!signature) return;
    const image = new Image();
    image.onload = function() {
        if (revision !== signaturePadRevision) return;
        const scale = Math.min(width / image.width, height / image.height);
        const imageWidth = image.width * scale;
        const imageHeight = image.height * scale;
        signatureCanvasContext.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
        signatureRestorePending = false;
    };
    image.onerror = function() {
        if (revision !== signaturePadRevision) return;
        signatureHasInk = false;
        signatureRestorePending = false;
    };
    image.src = signature;
}

function clearRecipientSignature() {
    const canvas = document.getElementById('recipient-signature-canvas');
    if (!canvas || !signatureCanvasContext) return;
    signaturePadRevision++;
    signatureCanvasContext.clearRect(0, 0, canvas.clientWidth, 140);
    signatureHasInk = false;
    signatureRestorePending = false;
    document.getElementById('recipient-signature-status').textContent = 'تم مسح مساحة التوقيع. احفظ لاعتماد التغيير.';
}

function saveRecipientSignature() {
    if (!currentPrintVoucher) return;
    if (!canIssueSalaryVoucher(currentPrintVoucher)) return;
    if (signatureRestorePending) {
        document.getElementById('recipient-signature-status').textContent = 'انتظر اكتمال تحميل التوقيع الحالي.';
        return;
    }

    const existingVoucher = vouchers.find(function(voucher) { return voucher.id === currentPrintVoucher.id; });
    if (!signatureHasInk && !currentPrintVoucher.recipientSignature) {
        alert('يرجى توقيع المستلم أولاً');
        return;
    }

    const signatureSaved = signatureHasInk;
    if (signatureHasInk) {
        currentPrintVoucher.recipientSignature = document.getElementById('recipient-signature-canvas').toDataURL('image/png');
    } else {
        delete currentPrintVoucher.recipientSignature;
    }

    if (existingVoucher) {
        Object.assign(existingVoucher, currentPrintVoucher);
        currentPrintVoucher = existingVoucher;
    } else {
        vouchers.push(currentPrintVoucher);
    }

    saveData();
    loadVouchers();
    refreshSalarySheet();
    document.getElementById('print-voucher-content').innerHTML = buildVoucherHTML(currentPrintVoucher);
    prepareRecipientSignature(currentPrintVoucher.recipientSignature || '');
    document.getElementById('recipient-signature-status').textContent = signatureSaved
        ? 'تم حفظ توقيع المستلم على السند.'
        : 'تم حذف توقيع المستلم من السند.';
}

function ensureSalaryVoucherSaved(voucher) {
    if (!voucher || !voucher.isSalary || !voucher.employeeId) return voucher;

    const savedVoucher = vouchers.find(function(item) { return item.id === voucher.id; });
    if (savedVoucher) return savedVoucher;

    const existingVoucher = getSalaryVouchersForPeriod(voucher.employeeId, voucher.year, voucher.month)[0];
    if (existingVoucher) return existingVoucher;
    if (!canIssueSalaryVoucher(voucher)) return null;

    vouchers.push(voucher);
    saveData();
    loadVouchers();
    refreshSalarySheet();
    return voucher;
}

function printVoucher() {
    const previousVoucher = currentPrintVoucher;
    currentPrintVoucher = ensureSalaryVoucherSaved(currentPrintVoucher);
    if (!currentPrintVoucher) {
        currentPrintVoucher = previousVoucher;
        return;
    }
    if (currentPrintVoucher !== previousVoucher) {
        document.getElementById('print-voucher-content').innerHTML = buildVoucherHTML(currentPrintVoucher);
        prepareRecipientSignature(currentPrintVoucher.recipientSignature || '');
    }

    const recipientName = currentPrintVoucher ? getVoucherRecipientName(currentPrintVoucher) : 'مستفيد';
    const jobName = recipientName.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'مستفيد';
    sweepText(document.body);
    document.title = jobName;

    if (printWithNative(jobName)) return;

    document.body.classList.add('print-voucher-only');
    try {
        window.print();
    } finally {
        document.body.classList.remove('print-voucher-only');
        document.title = t('نظام إدارة الرواتب');
    }
}

function closePrintVoucherModal() {
    document.getElementById('print-voucher-modal').style.display = 'none';
}

let editingVoucherId = null;

function onVoucherEditRecipientChange() {
    const isEmployee = document.getElementById('voucher-edit-recipient-type').value === 'employee';
    document.getElementById('voucher-edit-employee-group').style.display = isEmployee ? 'block' : 'none';
    document.getElementById('voucher-edit-external-group').style.display = isEmployee ? 'none' : 'block';
}

function editVoucher(id) {
    const voucher = vouchers.find(function(item) { return item.id === id; });
    if (!voucher) return;

    editingVoucherId = id;
    document.getElementById('voucher-edit-type').value = voucher.isSalary ? 'salary' : voucher.type;
    const recipientType = voucher.employeeId ? 'employee' : 'external';
    document.getElementById('voucher-edit-recipient-type').value = recipientType;

    const employeeSelect = document.getElementById('voucher-edit-employee');
    employeeSelect.innerHTML = '';
    employees.forEach(function(employee) {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = employee.id + ' - ' + empName(employee);
        employeeSelect.appendChild(option);
    });
    if (voucher.employeeId && !employees.some(function(employee) { return employee.id === voucher.employeeId; })) {
        const option = document.createElement('option');
        option.value = voucher.employeeId;
        option.textContent = voucher.employeeId + ' - موظف سابق';
        employeeSelect.appendChild(option);
    }
    if (voucher.employeeId) employeeSelect.value = voucher.employeeId;

    document.getElementById('voucher-edit-external-name').value = voucher.externalName || '';
    document.getElementById('voucher-edit-amount').value = voucher.amount;
    document.getElementById('voucher-edit-reason').value = voucher.reason || '';
    document.getElementById('voucher-edit-payment-method').value = voucher.paymentMethod || 'cash';
    document.getElementById('voucher-edit-date').value = voucher.date || '';
    onVoucherEditRecipientChange();
    document.getElementById('voucher-edit-modal').style.display = 'flex';
}

function closeVoucherEditModal() {
    document.getElementById('voucher-edit-modal').style.display = 'none';
    editingVoucherId = null;
}

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('voucher-edit-form');
    if (!form) return;

    form.addEventListener('submit', function(event) {
        event.preventDefault();
        const voucher = vouchers.find(function(item) { return item.id === editingVoucherId; });
        if (!voucher) {
            closeVoucherEditModal();
            return;
        }

        const type = document.getElementById('voucher-edit-type').value;
        const recipientType = document.getElementById('voucher-edit-recipient-type').value;
        const employeeId = recipientType === 'employee'
            ? parseInt(document.getElementById('voucher-edit-employee').value, 10)
            : null;
        const externalName = recipientType === 'external'
            ? document.getElementById('voucher-edit-external-name').value.trim()
            : '';
        const amount = Math.round(parseFloat(document.getElementById('voucher-edit-amount').value));
        const date = document.getElementById('voucher-edit-date').value;

        if (!Number.isFinite(amount) || amount <= 0) {
            alert('يرجى إدخال مبلغ صحيح أكبر من صفر');
            return;
        }
        const employeeExists = employees.some(function(employee) { return employee.id === employeeId; });
        if (recipientType === 'employee' && (!employeeId || (!employeeExists && voucher.employeeId !== employeeId))) {
            alert('يرجى تحديد موظف صحيح');
            return;
        }
        if (recipientType === 'external' && !externalName) {
            alert('يرجى تحديد المستفيد');
            return;
        }
        if (!date) {
            alert('يرجى تحديد التاريخ');
            return;
        }

        const previousDateParts = String(voucher.date || '').split('-');
        const salaryYear = voucher.isSalary && voucher.year != null
            ? Number(voucher.year)
            : parseInt(previousDateParts[0], 10);
        const salaryMonth = voucher.isSalary && voucher.month != null
            ? Number(voucher.month)
            : parseInt(previousDateParts[1], 10);

        voucher.type = type === 'collection' ? 'collection' : 'payment';
        voucher.isSalary = type === 'salary';
        voucher.employeeId = recipientType === 'employee' ? employeeId : null;
        voucher.externalName = externalName;
        voucher.amount = amount;
        voucher.reason = document.getElementById('voucher-edit-reason').value.trim();
        voucher.paymentMethod = document.getElementById('voucher-edit-payment-method').value;
        voucher.date = date;
        if (voucher.isSalary) {
            voucher.year = salaryYear;
            voucher.month = salaryMonth;
        } else {
            delete voucher.year;
            delete voucher.month;
        }

        saveData();
        loadVouchers();
        refreshSalarySheet();
        closeVoucherEditModal();
    });
});

function deleteVoucher(id) {
    if (!confirm('هل أنت متأكد من حذف هذا السند؟')) return;
    recordDeletion('vouchers', id);
    vouchers = vouchers.filter(v => v.id !== id);
    saveData();
    loadVouchers();
    refreshSalarySheet();
}

// ==================== الإعدادات ====================
function loadSettings() {
    document.getElementById('setting-company-name').value = settings.companyName;
    document.getElementById('setting-company-address').value = settings.companyAddress || '';
    document.getElementById('setting-company-phone').value = settings.companyPhone || '';
    document.getElementById('setting-company-email').value = settings.companyEmail || '';

    const preview = document.getElementById('logo-preview');
    if (settings.companyLogo) {
        preview.innerHTML = `<img src="${settings.companyLogo}">`;
    } else {
        preview.innerHTML = '<span style="color:var(--text-light);font-size:12px">لا يوجد شعار</span>';
    }

    const sigPreview = document.getElementById('signature-preview');
    if (settings.accountantSignature) {
        sigPreview.innerHTML = `<img src="${settings.accountantSignature}">`;
    } else {
        sigPreview.innerHTML = '<span style="color:var(--text-light);font-size:12px">لا يوجد توقيع</span>';
    }
    postRender();
}

function saveSettings() {
    settings.companyName = document.getElementById('setting-company-name').value.trim() || 'الشركة';
    settings.companyAddress = document.getElementById('setting-company-address').value.trim();
    settings.companyPhone = document.getElementById('setting-company-phone').value.trim();
    settings.companyEmail = document.getElementById('setting-company-email').value.trim();

    const logoFile = document.getElementById('setting-company-logo').files[0];
    const sigFile = document.getElementById('setting-signature').files[0];

    let pending = 0;
    const finish = function() {
        saveData();
        updateCompanyDisplay();
        loadSettings();
        alert('تم حفظ الإعدادات بنجاح');
    };

    const saveSettingsNow = function() {
        if (pending === 0) {
            finish();
        }
    };

    if (logoFile) {
        pending++;
        const reader = new FileReader();
        reader.onload = function(e) {
            settings.companyLogo = e.target.result;
            pending--;
            saveSettingsNow();
        };
        reader.readAsDataURL(logoFile);
    }

    if (sigFile) {
        pending++;
        const sigReader = new FileReader();
        sigReader.onload = function(e) {
            settings.accountantSignature = e.target.result;
            pending--;
            saveSettingsNow();
        };
        sigReader.readAsDataURL(sigFile);
    }

    saveSettingsNow();
}

function updateCompanyDisplay() {
    document.getElementById('sidebar-company-name').textContent = displayCompanyName();
    document.getElementById('login-company-name').textContent = displayCompanyName();
    if (typeof document.title === 'string') document.title = t('نظام إدارة الرواتب');
    const sidebarLogo = document.getElementById('sidebar-logo');
    const loginLogo = document.getElementById('login-logo');
    if (settings.companyLogo) {
        const sidebarImage = document.createElement('img');
        sidebarImage.src = settings.companyLogo;
        sidebarImage.alt = displayCompanyName();
        const loginImage = document.createElement('img');
        loginImage.src = settings.companyLogo;
        loginImage.alt = '';
        sidebarLogo.replaceChildren(sidebarImage);
        loginLogo.replaceChildren(loginImage);
        loginLogo.classList.add('has-logo');
    } else {
        const sidebarFallback = document.createElement('span');
        sidebarFallback.className = 'sidebar-logo-fallback';
        sidebarFallback.setAttribute('aria-hidden', 'true');
        sidebarFallback.textContent = settings.companyName.trim().charAt(0) || 'ع';
        sidebarLogo.replaceChildren(sidebarFallback);
        const fallback = document.createElement('span');
        fallback.className = 'login-logo-fallback';
        fallback.setAttribute('aria-hidden', 'true');
        fallback.textContent = settings.companyName.trim().charAt(0) || 'ع';
        loginLogo.replaceChildren(fallback);
        loginLogo.classList.remove('has-logo');
    }
    loginLogo.setAttribute('aria-label', 'شعار ' + displayCompanyName());
}

function changePassword() {
    const current = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;

    if (current !== settings.password) {
        alert('كلمة المرور الحالية غير صحيحة');
        return;
    }

    if (!newPass || newPass.length < 4) {
        alert('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل');
        return;
    }

    if (newPass !== confirmPass) {
        alert('كلمتا المرور غير متطابقتين');
        return;
    }

    settings.password = newPass;
    saveData();
    alert('تم تغيير كلمة المرور بنجاح');
    document.getElementById('current-password').value = '';
    document.getElementById('new-password').value = '';
    document.getElementById('confirm-password').value = '';
}

// ==================== التهيئة ====================
function initApp() {
    appInitialized = true;
    populateMonthYearSelectors();
    populateBranchFilters();
    refreshSalarySheet();
    refreshEmployees();
    refreshBranches();
    refreshVoucherPage();
    loadVouchers();
    refreshBranchSalaryReceipts();
    loadSettings();
    updateCompanyDisplay();
    refreshAbsenceDeductionReport();
}

document.addEventListener('DOMContentLoaded', function() {
    loadData();
    updateCompanyDisplay();
    initCloudSync();
    initLogin();
    initNavigation();

    // تحديث كل الفلاتر تلقائياً
    document.getElementById('salary-month').addEventListener('change', refreshSalarySheet);
    document.getElementById('salary-year').addEventListener('change', refreshSalarySheet);
    document.getElementById('salary-branch-filter').addEventListener('change', refreshSalarySheet);
    document.getElementById('salary-search').addEventListener('input', refreshSalarySheet);
    document.getElementById('salary-receipt-month').addEventListener('change', refreshBranchSalaryReceipts);
    document.getElementById('salary-receipt-year').addEventListener('change', refreshBranchSalaryReceipts);
    document.getElementById('salary-receipt-branch').addEventListener('change', refreshBranchSalaryReceipts);
    document.getElementById('salary-receipt-method').addEventListener('change', refreshBranchSalaryReceipts);
    document.getElementById('salary-receipt-date').addEventListener('change', refreshBranchSalaryReceipts);
    document.getElementById('salary-receipt-reprint-branches').addEventListener('click', function(event) {
        const button = event.target.closest('button[data-branch]');
        if (button) reprintBranchSalaryReceipts(button.dataset.branch);
    });
    document.getElementById('absence-deduction-search').addEventListener('input', refreshAbsenceDeductionReport);
    document.getElementById('absence-deduction-branch').addEventListener('change', refreshAbsenceDeductionReport);
    document.getElementById('absence-deduction-type').addEventListener('change', refreshAbsenceDeductionReport);
    document.getElementById('absence-deduction-from').addEventListener('change', refreshAbsenceDeductionReport);
    document.getElementById('absence-deduction-to').addEventListener('change', refreshAbsenceDeductionReport);

    document.getElementById('branch-summary-branch').addEventListener('change', refreshBranchEmployeesSummary);
    document.getElementById('branch-summary-month').addEventListener('change', refreshBranchEmployeesSummary);
    document.getElementById('branch-summary-year').addEventListener('change', refreshBranchEmployeesSummary);

    initializeRecipientSignaturePad();
    updateCompanyDisplay();
    postRender();
});