import {
  House,
  ListTodo,
  CalendarDays,
  ChartNoAxesColumn,
  NotebookPen,
  Sparkles,
  Settings,
  Clock3
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORE = 'mindflow-v1';
const todayKey = () => new Date().toLocaleDateString('en-CA');
const initialState = () => ({
  date: todayKey(), energy: 3, mood: 'Нормально', availableMinutes: 180,
  tasks: [], plan: null, reflections: {},
});
function loadState() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return initialState();
    const data = JSON.parse(raw);
    if (data.date !== todayKey()) return { ...data, date: todayKey(), plan: null, energy: 3, mood: 'Нормально', availableMinutes: 180 };
    return { ...initialState(), ...data };
  } catch { return initialState(); }
}
const priorities = { 'Срочно': 0, 'Важно': 1, 'Обычно': 2, 'Можно позже': 3 };
const mins = n => `${n} мин`;
function App() {
  const [chatLoading, setChatLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [data, setData] = useState(loadState);
  const [view, setView] = useState('today');
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState(15);
  const [priority, setPriority] = useState('Важно');
  const [category, setCategory] = useState('Личное');
  const [editId, setEditId] = useState(null);
  const [reflection, setReflection] = useState(data.reflections?.[todayKey()] || '');
  const [timerSeconds, setTimerSeconds] = useState(15 * 60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [chatMessages, setChatMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('mindflow-chat');
      if (saved) return JSON.parse(saved);
    } catch (error) {
      console.error('Не удалось загрузить историю чата:', error);
    }

    return [
      {
        role: 'assistant',
        content: 'Привет! Я AI-помощник MindFlow. Расскажи, что тебе нужно спланировать.'
      }
    ];
  });

  useEffect(() => { localStorage.setItem(STORE, JSON.stringify(data)); }, [data]);
useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerSeconds(s => {
      if (s <= 1) {
        setTimerRunning(false);
        setNotice('Фокус-блок завершён. Сделай короткую паузу.');
        return 0;
      }
      return s - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(id); }, [notice]);

  const activeTasks = data.tasks.filter(t => !t.done);
  const doneCount = data.tasks.filter(t => t.done).length;
  const plannedMinutes = activeTasks.reduce((sum, t) => sum + Number(t.duration || 15), 0);
  const sortedTasks = useMemo(() => [...data.tasks].sort((a,b) => Number(a.done)-Number(b.done) || priorities[a.priority]-priorities[b.priority] || a.createdAt-b.createdAt), [data.tasks]);

  async function sendChatMessage(e) {
    e.preventDefault();

    const message = chatInput.trim();
    if (!message || chatLoading) return;

    setChatMessages(prev => [
      ...prev,
      { role: 'user', content: message }
    ]);
    setChatInput('');
    setChatLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Не удалось получить ответ AI.');
      }

      let aiText = result.reply || 'AI не вернул ответ.';

      // Убираем Markdown-обрамление, если AI его добавил.
      const cleanText = aiText
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');

      try {
        const command = JSON.parse(cleanText);

        if (
          command.action === 'create_task' &&
          typeof command.title === 'string' &&
          command.title.trim()
        ) {
          const allowedPriorities = [
            'Срочно', 'Важно', 'Обычно', 'Можно позже'
          ];

          const allowedCategories = [
            'Работа', 'Дом', 'Здоровье',
            'Отношения', 'Личное', 'Отдых'
          ];

          const task = {
            id: crypto.randomUUID
              ? crypto.randomUUID()
              : String(Date.now()),
            title: command.title.trim().slice(0, 160),
            duration: Math.max(
              5,
              Math.min(180, Number(command.duration) || 15)
            ),
            priority: allowedPriorities.includes(command.priority)
              ? command.priority
              : 'Важно',
            category: allowedCategories.includes(command.category)
              ? command.category
              : 'Личное',
            done: false,
            createdAt: Date.now()
          };

          setData(prev => ({
            ...prev,
            tasks: [...prev.tasks, task],
            plan: null
          }));

          aiText = `Задача «${task.title}» добавлена! Время: ${task.duration} минут.`;
        }
      } catch {
        // Если ответ не JSON, показываем его как обычный текст.
      }

      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: aiText }
      ]);
    } catch (error) {
      setChatMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: 'Не удалось связаться с AI. Проверь, что сервер запущен. ' + error.message
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  }

  function update(patch) { setData(prev => ({ ...prev, ...patch })); }
  function addTask(e) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) { setNotice('Напиши название задачи.'); return; }
    if (editId) {
      update({ tasks: data.tasks.map(t => t.id === editId ? { ...t, title: clean, duration: Number(duration), priority, category } : t), plan: null });
      setEditId(null); setNotice('Задача обновлена.');
    } else {
      const task = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title: clean, duration: Number(duration), priority, category, done: false, createdAt: Date.now() };
      update({ tasks: [...data.tasks, task], plan: null }); setNotice('Задача добавлена.');
    }
    setTitle(''); setDuration(15); setPriority('Важно'); setCategory('Личное');
  }
  function editTask(t) { setTitle(t.title); setDuration(t.duration); setPriority(t.priority); setCategory(t.category); setEditId(t.id); setView('tasks'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function toggleTask(id) { update({ tasks: data.tasks.map(t => t.id === id ? { ...t, done: !t.done } : t), plan: null }); }
  function removeTask(id) { update({ tasks: data.tasks.filter(t => t.id !== id), plan: null }); setNotice('Задача удалена.'); }
  function generatePlan() {
    if (!activeTasks.length) { setNotice('Сначала добавь хотя бы одну задачу.'); setView('tasks'); return; }
    const ordered = [...activeTasks].sort((a,b) => priorities[a.priority]-priorities[b.priority] || a.duration-b.duration || a.createdAt-b.createdAt);
    const capacity = Number(data.availableMinutes);
    let used = 0; const focus = []; const later = [];
    for (const task of ordered) {
      if (used + task.duration <= capacity || (focus.length === 0 && task.priority === 'Срочно')) { focus.push(task.id); used += task.duration; }
      else later.push(task.id);
    }
    const main = ordered.find(t => t.priority === 'Срочно') || ordered.find(t => t.priority === 'Важно') || ordered[0];
    const gentle = Number(data.energy) <= 2;
    update({ plan: { createdAt: Date.now(), mainTaskId: main.id, focus, later, used, gentle } });
    setView('today'); setNotice('План дня готов. Его можно изменить в любой момент.');
  }
  function saveReflection() {
    update({ reflections: { ...data.reflections, [todayKey()]: reflection.trim() } });
    setNotice('Итог дня сохранён.');
  }
  function resetDay() {
    if (!confirm('Удалить все задачи и план этого дня? Это действие нельзя отменить.')) return;
    update({ tasks: [], plan: null, energy: 3, mood: 'Нормально', availableMinutes: 180 }); setReflection(''); setNotice('День очищен.');
  }
  const planMain = data.plan && data.tasks.find(t => t.id === data.plan.mainTaskId);
  const greeting = Number(data.energy) <= 2 ? 'Сегодня бережно, без гонки.' : Number(data.energy) >= 4 ? 'Есть силы — направим их на важное.' : 'Давай сделаем день реалистичным.';

  return <div className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={() => setView('today')}>
        <span className="brand-mark">m</span>
        <span>mindflow<span className="brand-dot">.</span></span>
      </button>

      <div className="sidebar-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>

      <nav className="side-nav" aria-label="Главное меню">
        {[
  ['today', House, 'Главная'],
  ['tasks', ListTodo, 'Задачи'],
  ['chat', Sparkles, 'AI-ассистент'],
  ['reflection', Clock3, 'Итоги дня']
].map(([id, Icon, label]) => (
          <button
            key={id}
            className={view === id ? 'side-link active' : 'side-link'}
            onClick={() => setView(id)}
          >
            <span className="side-icon"><Icon size={19} strokeWidth={1.8} /></span>
            <span>{label}</span>
            {id === 'tasks' && activeTasks.length > 0 && (
              <span className="side-count">{activeTasks.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-tip">
          <span>✦</span>
          <strong>Один шаг за раз</strong>
          <p>Не обязательно успеть всё сегодня.</p>
        </div>
        <div className="sidebar-version">MINDFLOW · ТВОЁ ПРОСТРАНСТВО</div>
      </div>
    </aside>

    <div className="workspace">
    <header className="topbar"><button className="brand" onClick={() => setView('today')} aria-label="MindFlow, на главную"><span className="brand-mark">m</span><span>mindflow<span className="brand-dot">.</span></span></button><div className="date-label">{new Date().toLocaleDateString('ru-RU',{ weekday:'short', day:'numeric', month:'long' })}</div><button className="avatar" onClick={() => setView('reflection')} title="Итоги дня">✦</button></header>
    <main>
      <section className="hero"><div className="eyebrow"><span className="live-dot"/> ТВОЁ ПРОСТРАНСТВО</div><h1>Привет.<br/><em>Выдохни.</em></h1><p>{greeting} Не нужно успеть всё — достаточно понять, что важно сейчас.</p><div className="hero-meta"><span>☁️ Без перегруза</span><span>◷ Один шаг за раз</span></div></section>
      
      {view==='today' && <div className="content-grid">
        <section className="panel checkin"><div className="section-heading"><div><span className="kicker">01 / CHECK-IN</span><h2>Как ты сегодня?</h2></div><span className="section-icon"><Sparkles size={20} strokeWidth={1.8} /></span></div>
          <label className="field-label">Уровень энергии <strong>{['','На нуле','Низкий','Средний','Хороший','Высокий'][data.energy]}</strong></label><div className="energy-scale">{[1,2,3,4,5].map(n=><button key={n} onClick={()=>update({energy:n,plan:null})} className={data.energy===n?'energy active':'energy'} aria-label={`Энергия ${n}`}>{['☾','◔','◑','◕','☀'][n-1]}</button>)}</div>
          <label className="field-label" htmlFor="mood">Настроение</label><select id="mood" value={data.mood} onChange={e=>update({mood:e.target.value,plan:null})}><option>Спокойно</option><option>Хорошо</option><option>Нормально</option><option>Тревожно</option><option>Устал</option><option>Раздражён</option></select>
          <label className="field-label" htmlFor="time">Сколько времени есть на задачи?</label><div className="range-row"><input id="time" type="range" min="30" max="480" step="15" value={data.availableMinutes} onChange={e=>update({availableMinutes:Number(e.target.value),plan:null})}/><strong>{data.availableMinutes>=60?`${Math.floor(data.availableMinutes/60)} ч${data.availableMinutes%60?` ${data.availableMinutes%60} мин`:''}`:mins(data.availableMinutes)}</strong></div>
          <button className="primary-button full" onClick={generatePlan}>Составить план дня <span>↗</span></button>
        </section>
        <section className="panel plan-panel"><div className="section-heading"><div><span className="kicker">02 / FOCUS</span><h2>Твой фокус</h2></div><span className="section-icon"><House size={20} strokeWidth={1.8} /></span></div>
          {data.plan && planMain ? <><div className="focus-card"><div className="focus-label"><span className="live-dot"/> ГЛАВНЫЙ ПРИОРИТЕТ</div><h3>{planMain.title}</h3><div className="task-meta"><span>◷ {mins(planMain.duration)}</span><span>{planMain.category}</span></div><button className="primary-button" onClick={()=>toggleTask(planMain.id)}>{planMain.done?'Вернуть в задачи':'Отметить выполненным'} <span>✓</span></button></div><div className="plan-summary"><div><strong>{data.plan.focus.length}</strong><span>в фокусе</span></div><div><strong>{mins(data.plan.used)}</strong><span>нагрузка</span></div><div><strong>{data.plan.later.length}</strong><span>на потом</span></div></div>{data.plan.gentle&&<p className="gentle-note">♡ Энергии сейчас немного. Начни с короткого шага и оставь место для отдыха.</p>}<div className="small-task-list">{data.plan.focus.filter(id=>id!==planMain.id).map(id=>{const t=data.tasks.find(x=>x.id===id);return t&&<div className="mini-task" key={id}><span>↳</span><span>{t.title}</span><small>{mins(t.duration)}</small></div>})}{data.plan.later.length>0&&<p className="later-note">{data.plan.later.length} задач оставлены на потом — это не провал, а ограничение нагрузки.</p>}</div></> : <div className="empty-focus"><div className="empty-orbit">◎</div><h3>Освободи голову</h3><p>Отметь своё состояние и добавь задачи. MindFlow поможет выбрать, с чего начать.</p><button className="secondary-button" onClick={()=>setView('tasks')}>Добавить задачи <span>＋</span></button></div>}
        </section>
        <section className="panel progress-panel">
  <div className="section-heading">
    <div>
      <span className="kicker">03 / ПРОГРЕСС</span>
      <h2>Уже сделано</h2>
    </div>
    <span className="section-icon">
      <ChartNoAxesColumn size={20} strokeWidth={1.8} />
    </span>
  </div>

  <div className="progress-overview">
    <div
      className="progress-ring"
      style={{
        '--progress': `${data.tasks.length ? doneCount / data.tasks.length * 100 : 0}%`
      }}
    >
      <div className="progress-ring-inner">
        <strong>{Math.round(data.tasks.length ? doneCount / data.tasks.length * 100 : 0)}%</strong>
        <span>готово</span>
      </div>
    </div>

    <div className="progress-copy">
      <strong>
        {data.tasks.length === 0
          ? 'Начни с одной задачи'
          : doneCount === data.tasks.length
            ? 'Хорошая работа!'
            : 'Каждый шаг считается'}
      </strong>
      <p>
        {data.tasks.length === 0
          ? 'Не нужно планировать весь мир.'
          : `Выполнено ${doneCount} из ${data.tasks.length}. Осталось ${activeTasks.length}.`}
      </p>
    </div>
  </div>

  <div className="progress-track">
    <span
      style={{
        width: `${data.tasks.length ? doneCount / data.tasks.length * 100 : 0}%`
      }}
    />
  </div>

  <button className="text-button" onClick={() => setView('tasks')}>
    Посмотреть задачи <span>→</span>
  </button>
</section>
        <section className="panel timer-panel"><div className="section-heading"><div><span className="kicker">04 / МАЛЕНЬКИЙ ШАГ</span><h2>Фокус на 15 минут</h2></div><span className="section-icon"><Clock3 size={20} strokeWidth={1.8} /></span></div><p>Не нужно ждать мотивации. Просто побудь с одной задачей 15 минут.</p><div className="timer-display">{String(Math.floor(timerSeconds/60)).padStart(2,'0')}:{String(timerSeconds%60).padStart(2,'0')}</div><div className="timer-actions"><button className="primary-button" onClick={()=>setTimerRunning(v=>!v)}>{timerRunning?'Пауза':'Начать фокус'} <span>{timerRunning?'Ⅱ':'▶'}</span></button><button className="secondary-button" onClick={()=>{setTimerRunning(false);setTimerSeconds(900)}}>Сбросить</button></div></section>
      </div>}
      {view==='chat'&&<section className="chat-view">
        <div className="view-intro">
          <span className="kicker">AI / MINDFLOW</span>
          <h2>Давай разберёмся вместе</h2>
          <p>Расскажи, что нужно сделать. Я помогу расставить приоритеты и разбить задачу на шаги.</p>
        </div>
        <div className="panel chat-panel">
          <div className="chat-messages" aria-live="polite">
            {chatMessages.map((item, index) => (
              <div key={index} className={`chat-message ${item.role === 'user' ? 'chat-user' : 'chat-assistant'}`}>
                <span className="chat-role">{item.role === 'user' ? 'Ты' : 'MindFlow AI'}</span>
                <p>{item.content}</p>
              </div>
            ))}
            {chatLoading && (
              <div className="chat-message chat-assistant">
                <span className="chat-role">MindFlow AI</span>
                <p>Думаю над ответом…</p>
              </div>
            )}
          </div>
          <form className="chat-form" onSubmit={sendChatMessage}>
            <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Напиши сообщение…" rows="3" maxLength="4000" disabled={chatLoading} />
            <button className="primary-button full" type="submit" disabled={chatLoading || !chatInput.trim()}>{chatLoading ? 'Отправляю…' : 'Отправить сообщение'} <span>↗</span></button>
          </form>
          <p className="privacy-note">Сообщения отправляются в AI-сервис для получения ответа.</p>
        </div>
      </section>}
      {view==='tasks'&&<section className="tasks-view"><div className="view-intro"><span className="kicker">ТВОЙ СПИСОК</span><h2>Задачи без хаоса</h2><p>Запиши всё, что занимает голову. Потом решим, что делать первым.</p></div><form className="panel task-form" onSubmit={addTask}><label className="field-label" htmlFor="task-title">Что нужно сделать?</label><input id="task-title" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Например, закончить отчёт" maxLength="160" autoComplete="off"/><div className="form-grid"><div><label className="field-label" htmlFor="task-duration">Сколько займёт</label><select id="task-duration" value={duration} onChange={e=>setDuration(Number(e.target.value))}><option value="5">5 минут</option><option value="15">15 минут</option><option value="25">25 минут</option><option value="30">30 минут</option><option value="45">45 минут</option><option value="60">1 час</option><option value="90">1,5 часа</option><option value="120">2 часа</option><option value="180">3 часа</option></select></div><div><label className="field-label" htmlFor="task-priority">Приоритет</label><select id="task-priority" value={priority} onChange={e=>setPriority(e.target.value)}><option>Срочно</option><option>Важно</option><option>Обычно</option><option>Можно позже</option></select></div><div><label className="field-label" htmlFor="task-category">Категория</label><select id="task-category" value={category} onChange={e=>setCategory(e.target.value)}><option>Работа</option><option>Дом</option><option>Здоровье</option><option>Отношения</option><option>Личное</option><option>Отдых</option></select></div></div><button className="primary-button full" type="submit">{editId?'Сохранить изменения':'Добавить задачу'} <span>＋</span></button>{editId&&<button type="button" className="text-button cancel-edit" onClick={()=>{setEditId(null);setTitle('')}}>Отменить редактирование</button>}</form>
        <div className="task-list-heading"><h3>Все задачи <span>{data.tasks.length}</span></h3><button className="text-button" onClick={generatePlan}>Составить план →</button></div>
        {sortedTasks.length===0?<div className="panel blank-state"><div className="empty-orbit">＋</div><h3>Здесь пока пусто</h3><p>Добавь одну задачу. Не обязательно расписывать весь день сразу.</p></div>:<div className="task-list">{sortedTasks.map(t=><article className={`task-item ${t.done?'is-done':''}`} key={t.id}><button className={`task-check ${t.done?'checked':''}`} onClick={()=>toggleTask(t.id)} aria-label={t.done?'Вернуть задачу':'Отметить выполненной'}>{t.done?'✓':''}</button><div className="task-info"><div className="task-title">{t.title}</div><div className="task-meta"><span>{mins(t.duration)}</span><span>{t.category}</span><span className={`priority priority-${priorities[t.priority]}`}>{t.priority}</span></div></div><div className="task-actions"><button onClick={()=>editTask(t)} aria-label="Редактировать задачу" title="Редактировать">✎</button><button onClick={()=>removeTask(t.id)} aria-label="Удалить задачу" title="Удалить">×</button></div></article>)}</div>}
        <div className="load-note"><span>☁</span><div><strong>Текущая нагрузка: {mins(plannedMinutes)}</strong><p>Общее время незавершённых задач. Планировщик может предложить перенести часть дел, если времени не хватит.</p></div></div>
      </section>}
      {view==='reflection'&&<section className="reflection-view"><div className="view-intro"><span className="kicker">ЗАВЕРШЕНИЕ ДНЯ</span><h2>Ты сделал достаточно,<br/><em>чтобы продолжить.</em></h2><p>Разбор нужен не для самокритики. Он помогает понять, что сработало, а что стоит изменить завтра.</p></div><div className="panel reflection-stats"><div><strong>{doneCount}</strong><span>задач сделано</span></div><div><strong>{activeTasks.length}</strong><span>осталось</span></div><div><strong>{mins(data.tasks.filter(t=>t.done).reduce((s,t)=>s+t.duration,0))}</strong><span>время выполненного</span></div></div><div className="panel reflection-form"><label className="field-label" htmlFor="reflection">Что сегодня получилось? Что важно перенести на завтра?</label><textarea id="reflection" rows="5" maxLength="1500" value={reflection} onChange={e=>setReflection(e.target.value)} placeholder="Даже маленькая победа считается…"/><button className="primary-button full" onClick={saveReflection}>Сохранить итоги <span>✓</span></button><p className="privacy-note">Твои записи хранятся локально в этом браузере.</p></div><button className="text-button reset-day" onClick={resetDay}>Очистить задачи и начать заново</button></section>}
      <footer><span className="footer-mark">m.</span><span>Меньше давления. Больше ясности.</span><span>MindFlow © {new Date().getFullYear()}</span></footer>
    </main>
    {notice&&<div className="toast" role="status">{notice}</div>}
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
