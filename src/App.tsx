import { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  BellRing,
  Bell,
  User as UserIcon,
} from 'lucide-react';

// הגדרות למשתנים גלובליים כדי ש-TypeScript לא יציג שגיאות
declare const __firebase_config: string | undefined;
declare const __app_id: string | undefined;
declare const __initial_auth_token: string | undefined;

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: 'AIzaSyCjxh_cjgkIo0T7Hc4mmOsHqAYi2L1jOCg',
  authDomain: 'command-status-bfcc3.firebaseapp.com',
  databaseURL: 'https://command-status-bfcc3-default-rtdb.firebaseio.com',
  projectId: 'command-status-bfcc3',
  storageBucket: 'command-status-bfcc3.firebasestorage.app',
  messagingSenderId: '729514404751',
  appId: '1:729514404751:web:871a63817a5c7bcb42f9fa',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
// הוספנו את חמ״ל בט״ש וחמ״ל התקפי מעל תאג״ד לרשימה, ואת אזור הקשר מעל התאג״ד
const AREAS = ['מג״ד', 'א', 'ב', 'ג', 'ד', 'פלס״מ', 'חמ״ל בט״ש', 'חמ״ל התקפי', 'קשר', 'תאג״ד'];

export default function App() {
  // הגדרת סוגי נתונים מדויקים (Types) עבור ה-State
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // מנגנון התראות (מערך כדי לתמוך בכמה הודעות במקביל)
  const [toasts, setToasts] = useState<{ id: number; message: string; timestamp: string }[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] =
    useState<boolean>(false);

  // רפרנסים למניעת התראות על טעינה ראשונית ועל שינויים שאנחנו עשינו
  const isFirstLoad = useRef<boolean>(true);
  const localChanges = useRef<Record<string, string>>({});

  // בדיקת אישור התראות דפדפן בטעינה
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationsEnabled(true);
    }
  }, []);

  // 1. התחברות ראשונית
  useEffect(() => {
    if (!auth) return;

    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== 'undefined' &&
          __initial_auth_token
        ) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenErr: any) {
            // אם הטוקן של הסביבה לא תואם למסד הנתונים הפרטי שלך, נתעלם ממנו ונתחבר אנונימית
            console.warn('Custom token mismatch. Falling back to anonymous auth.');
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err: any) {
        console.error('שגיאת התחברות:', err);
        setError(`שגיאת התחברות ל-Firebase: ${err.message}`);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. פונקציה להשמעת צפצוף (חיווי קולי)
  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // צליל גבוה ובולט
      gain.gain.setValueAtTime(0.1, ctx.currentTime); // עוצמה
      osc.start();
      osc.stop(ctx.currentTime + 0.3); // אורך הצפצוף
    } catch (e) {
      console.log('Audio not supported or blocked', e);
    }
  };

  // 3. פונקציה להקפצת ההתראה הכללית
  const triggerAlert = (area: string, status: string) => {
    // הוספת המילה "פלוגה" אם זה א,ב,ג,ד
    const areaName = ['א', 'ב', 'ג', 'ד'].includes(area)
      ? `פלוגה ${area}'`
      : area;
    const msg = `שינוי סטטוס - ${areaName} בפיקוד ${status}`;

    // יצירת חותמת זמן (שעה ותאריך)
    const now = new Date();
    const timeString = now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    const dateString = now.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const timestamp = `${timeString} | ${dateString}`;

    // א. הוספת התראה למערך ההתראות הקופצות באתר
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message: msg, timestamp }]);

    // הסרת ההתראה הספציפית אחרי 5 שניות
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);

    // ב. השמעת צפצוף
    playBeep();

    // ג. התראת דפדפן (אם המשתמש אישר)
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('עדכון כוננות חמ״ל', {
        body: msg,
        dir: 'rtl',
      });
      // רטט בטלפונים תומכים
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }
  };

  // 4. בקשת אישור מהמשתמש לשלוח לו התראות
  const requestNotificationPermission = () => {
    if (!('Notification' in window)) {
      alert('הדפדפן שלך לא תומך בהתראות קופצות.');
      return;
    }
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        setNotificationsEnabled(true);
      }
    });
  };

  // 5. האזנה לשינויים במסד הנתונים
  useEffect(() => {
    if (!user || !db) return;

    const collectionRef = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'area_statuses'
    );

    const unsubscribe = onSnapshot(
      collectionRef,
      (snapshot: any) => {
        // בטעינה הראשונה של האתר אנחנו רק אוספים נתונים, לא מקפיצים התראות
        if (isFirstLoad.current) {
          const newStatuses: Record<string, string> = {};
          snapshot.forEach((doc: any) => {
            newStatuses[doc.id] = doc.data().status;
          });
          setStatuses(newStatuses);
          isFirstLoad.current = false;
          setLoading(false);
          return;
        }

        // מרגע שהאתר נטען, אנחנו בודקים רק מה *השתנה*
        snapshot.docChanges().forEach((change: any) => {
          if (change.type === 'modified' || change.type === 'added') {
            const area = change.doc.id;
            const newStatus = change.doc.data().status;

            // האם *אני* עשיתי את השינוי הרגע? אם כן, לא נקפיץ לעצמי התראה
            if (localChanges.current[area] === newStatus) {
              delete localChanges.current[area]; // מנקים את המעקב
              setStatuses((prev) => ({ ...prev, [area]: newStatus }));
            } else {
              // מישהו אחר עשה את השינוי! מעדכנים ומקפיצים התראה
              setStatuses((prev) => ({ ...prev, [area]: newStatus }));
              triggerAlert(area, newStatus);
            }
          }
        });
      },
      (err: any) => {
        console.error('שגיאה בקריאת נתונים:', err);
        setError('שגיאה בטעינת הנתונים.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // 6. פונקציה לעדכון הסטטוס על ידי המשתמש
  const handleStatusChange = async (area: string, newStatus: string) => {
    if (!user || !db) return;

    // רושמים שאנחנו אלו שעשינו את השינוי כדי לא לקבל עליו התראה חזרה
    localChanges.current[area] = newStatus;

    // עדכון מיידי במסך שלנו
    setStatuses((prev) => ({ ...prev, [area]: newStatus }));

    try {
      const docRef = doc(
        db,
        'artifacts',
        appId,
        'public',
        'data',
        'area_statuses',
        area
      );
      await setDoc(
        docRef,
        { status: newStatus, updatedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch (err: any) {
      console.error('שגיאה בעדכון המסמך:', err);
      setError('שגיאה בשמירת הנתונים.');
    }
  };

  // פונקציה לבניית הכפתורים בהתאם לאזור (רגיל או תאג״ד)
  const renderAreaOptions = (area: string) => {
    let options = [];
    
    // אם זה תאג״ד, נציג שמות ספציפיים עם צבעים שונים
    if (area === 'תאג״ד') {
      options = [
        { value: 'רועי', icon: UserIcon, bgClass: 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm', iconClass: 'text-indigo-600' },
        { value: 'קווין', icon: UserIcon, bgClass: 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm', iconClass: 'text-emerald-600' },
        { value: 'עמינדב', icon: UserIcon, bgClass: 'bg-purple-50 border-purple-500 text-purple-700 shadow-sm', iconClass: 'text-purple-600' },
      ];
    } else if (area === 'קשר') {
      options = [
        { value: 'נגדי', icon: UserIcon, bgClass: 'bg-rose-50 border-rose-500 text-rose-700 shadow-sm', iconClass: 'text-rose-600' },
        { value: 'רון', icon: UserIcon, bgClass: 'bg-fuchsia-50 border-fuchsia-500 text-fuchsia-700 shadow-sm', iconClass: 'text-fuchsia-600' },
      ];
    } else if (area === 'חמ״ל בט״ש' || area === 'חמ״ל התקפי') {
      options = [
        { value: 'לירון', icon: UserIcon, bgClass: 'bg-pink-50 border-pink-500 text-pink-700 shadow-sm', iconClass: 'text-pink-600' },
        { value: 'נועם', icon: UserIcon, bgClass: 'bg-teal-50 border-teal-500 text-teal-700 shadow-sm', iconClass: 'text-teal-600' },
        { value: 'ליהיא', icon: UserIcon, bgClass: 'bg-amber-50 border-amber-500 text-amber-700 shadow-sm', iconClass: 'text-amber-600' },
        { value: 'שירה', icon: UserIcon, bgClass: 'bg-cyan-50 border-cyan-500 text-cyan-700 shadow-sm', iconClass: 'text-cyan-600' },
      ];
    } else {
      // אחרת, אלו האפשרויות הרגילות
      options = [
        { value: 'קודקוד', icon: ShieldCheck, bgClass: 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm', iconClass: 'text-blue-600' },
        { value: 'משנה', icon: ShieldAlert, bgClass: 'bg-orange-50 border-orange-500 text-orange-700 shadow-sm', iconClass: 'text-orange-600' },
      ];
    }

    return options.map((opt) => {
      const isSelected = statuses[area] === opt.value;
      const IconComp = opt.icon;
      
      return (
        <label
          key={opt.value}
          className={`flex-1 md:flex-none flex items-center justify-center gap-2 p-3 md:px-6 rounded-lg cursor-pointer border-2 transition-all font-semibold select-none ${
            isSelected
              ? opt.bgClass
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300'
          }`}
        >
          <input
            type="radio"
            name={`area_${area}`}
            value={opt.value}
            checked={isSelected}
            onChange={() => handleStatusChange(area, opt.value)}
            className="hidden"
          />
          <IconComp className={`w-5 h-5 ${isSelected ? opt.iconClass : 'text-slate-400'}`} />
          {opt.value}
        </label>
      );
    });
  };

  if (error) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans p-4"
      >
        <div className="bg-red-50 text-red-700 p-8 rounded-2xl border border-red-200 max-w-md w-full text-center shadow-lg">
          <ShieldAlert className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-2xl font-bold mb-4">שגיאת התחברות</h2>
          <p className="mb-4 text-slate-800 font-medium" dir="ltr">
            {error}
          </p>
        </div>
      </div>
    );
  }

  if (!user || loading) {
    return (
      <div
        dir="rtl"
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans"
      >
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700">
          מתחבר למסד הנתונים...
        </h2>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800 relative overflow-hidden"
    >
      {/* בועות ההתראה הקופצות (Toasts) - יכולות להופיע כמה במקביל */}
      <div className="fixed top-8 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-3 w-full max-w-sm px-4 items-center pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="bg-blue-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 border-2 border-blue-400 animate-bounce pointer-events-auto"
          >
            <BellRing className="w-6 h-6 text-yellow-400 animate-pulse shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-lg">{toast.message}</span>
              <span className="text-xs text-blue-200 mt-0.5" dir="ltr">{toast.timestamp}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 mt-12 md:mt-0">
        <div className="bg-slate-800 text-white p-6 relative">
          <h1 className="text-white text-2xl md:text-3xl font-bold flex items-center justify-center gap-3">
            סטטוס כוננות מפקדים
          </h1>
          <div className="absolute top-6 left-6 hidden md:flex items-center gap-2 text-sm bg-slate-700/50 px-3 py-1.5 rounded-full border border-slate-600">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
            מחובר ומסונכרן
          </div>
        </div>

        {/* בקשת הרשאת התראות (מופיע רק אם לא אושר) */}
        {!notificationsEnabled && 'Notification' in window && (
          <div className="bg-yellow-50 border-b border-yellow-200 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-yellow-800">
              <Bell className="w-5 h-5" />
              <span className="text-sm font-medium">
                כדי לקבל התראות למכשיר כשהאתר פתוח, אנא אשר התראות.
              </span>
            </div>
            <button
              onClick={requestNotificationPermission}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors w-full md:w-auto"
            >
              הפעל התראות
            </button>
          </div>
        )}

        <div className="p-4 md:p-8 space-y-4">
          {AREAS.map((area) => (
            <div
              key={area}
              className="flex flex-col md:flex-row md:items-center justify-between p-5 bg-slate-50 rounded-xl border border-slate-200 hover:border-blue-200 hover:shadow-sm transition-all duration-200"
            >
              <div className="text-xl font-bold text-slate-700 w-32 mb-4 md:mb-0">
                {['א', 'ב', 'ג', 'ד'].includes(area) ? `פלוגה ${area}'` : area}
              </div>

              <div className="flex flex-wrap gap-4">
                {renderAreaOptions(area)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}