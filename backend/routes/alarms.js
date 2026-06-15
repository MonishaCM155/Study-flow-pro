// routes/alarms.js — sql.js version
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { run, get, all } from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { sendAlarmReminderEmail } from '../services/email.js';

const router = Router();

function serializeAlarm(a) {
  return { id:a.id, label:a.label, when:a.when_time, repeat:a.repeat,
    active:!!a.active, fired:!!a.fired, taskId:a.task_id||null, userId:a.user_id, createdAt:a.created_at };
}

/* LIST */
router.get('/', authMiddleware, (req,res) => {
  try {
    const alarms = all('SELECT * FROM alarms WHERE user_id=? ORDER BY when_time ASC',[req.user.id]);
    res.json({alarms:alarms.map(serializeAlarm)});
  } catch(err){res.status(500).json({error:'Failed to fetch alarms'});}
});

/* CREATE */
router.post('/', authMiddleware, (req,res) => {
  const {label,when,repeat,taskId} = req.body;
  if (!label?.trim()) return res.status(400).json({error:'Label required'});
  if (!when) return res.status(400).json({error:'Time required'});
  try {
    const id = uuid();
    run('INSERT INTO alarms(id,label,when_time,repeat,task_id,user_id) VALUES(?,?,?,?,?,?)',
      [id, label.trim(), new Date(when).toISOString(), repeat||'once', taskId||null, req.user.id]);
    const alarm = get('SELECT * FROM alarms WHERE id=?',[id]);
    scheduleAlarmPush(serializeAlarm(alarm), req.user.id);
    res.status(201).json({alarm:serializeAlarm(alarm)});
  } catch(err){console.error('[Alarms/create]',err);res.status(500).json({error:'Failed to create alarm'});}
});

/* UPDATE */
router.put('/:id', authMiddleware, (req,res) => {
  try {
    const existing = get('SELECT id FROM alarms WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if (!existing) return res.status(404).json({error:'Alarm not found'});
    const {label,when,repeat,active} = req.body;
    const sets=[], params=[];
    if (label!==undefined){sets.push('label=?');params.push(label);}
    if (when!==undefined){sets.push('when_time=?');params.push(new Date(when).toISOString());}
    if (repeat!==undefined){sets.push('repeat=?');params.push(repeat);}
    if (active!==undefined){sets.push('active=?');params.push(active?1:0);}
    if (!sets.length) return res.status(400).json({error:'No fields'});
    params.push(req.params.id);
    run(`UPDATE alarms SET ${sets.join(',')} WHERE id=?`,params);
    const alarm=get('SELECT * FROM alarms WHERE id=?',[req.params.id]);
    res.json({alarm:serializeAlarm(alarm)});
  } catch(err){res.status(500).json({error:'Failed to update alarm'});}
});

/* DELETE */
router.delete('/:id', authMiddleware, (req,res) => {
  try {
    const existing=get('SELECT id FROM alarms WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if (!existing) return res.status(404).json({error:'Alarm not found'});
    run('DELETE FROM alarms WHERE id=?',[req.params.id]);
    res.json({ok:true});
  } catch(err){res.status(500).json({error:'Failed to delete alarm'});}
});

/* FIRE (test) */
router.post('/:id/fire', authMiddleware, async (req,res) => {
  try {
    const alarm=get('SELECT * FROM alarms WHERE id=? AND user_id=?',[req.params.id,req.user.id]);
    if (!alarm) return res.status(404).json({error:'Alarm not found'});
    await fireAlarmNotification(serializeAlarm(alarm), req.user.id);
    res.json({ok:true,fired:true});
  } catch(err){res.status(500).json({error:'Failed to fire alarm'});}
});

/* DUE ALARMS (polling endpoint) */
router.get('/due', authMiddleware, (req,res) => {
  try {
    const now = new Date();
    const windowStart = new Date(now.getTime()-60000).toISOString();
    const due = all(
      'SELECT * FROM alarms WHERE user_id=? AND active=1 AND fired=0 AND when_time>=? AND when_time<=?',
      [req.user.id, windowStart, now.toISOString()]
    );
    if (due.length>0) {
      const onceIds=due.filter(a=>a.repeat==='once').map(a=>a.id);
      onceIds.forEach(id=>run('UPDATE alarms SET fired=1 WHERE id=?',[id]));
      due.filter(a=>a.repeat!=='once').forEach(a=>{
        const next=new Date(a.when_time);
        if (a.repeat==='daily') next.setDate(next.getDate()+1);
        else if (a.repeat==='weekly') next.setDate(next.getDate()+7);
        run('UPDATE alarms SET when_time=? WHERE id=?',[next.toISOString(),a.id]);
      });
    }
    res.json({due:due.map(serializeAlarm)});
  } catch(err){res.status(500).json({error:'Failed to check alarms'});}
});

/* HELPERS */
async function fireAlarmNotification(alarm, userId) {
  const user = get('SELECT * FROM users WHERE id=?',[userId]);
  if (!user) return;
  try {
    await sendAlarmReminderEmail({to:user.email,toName:user.name,alarmLabel:alarm.label,alarmTime:new Date(alarm.when).toLocaleString()});
  } catch(e){console.warn('[Email] Alarm email failed:',e.message);}
}

const scheduledTimers = new Map();
export function scheduleAlarmPush(alarm, userId) {
  if (!alarm.active||alarm.fired) return;
  const delay = new Date(alarm.when).getTime()-Date.now();
  if (delay<0||delay>24*60*60*1000) return;
  if (scheduledTimers.has(alarm.id)) clearTimeout(scheduledTimers.get(alarm.id));
  const timer = setTimeout(async()=>{
    scheduledTimers.delete(alarm.id);
    const fresh=get('SELECT * FROM alarms WHERE id=?',[alarm.id]);
    if (fresh&&fresh.active&&!fresh.fired) {
      await fireAlarmNotification(serializeAlarm(fresh),userId);
      if (fresh.repeat==='once') run('UPDATE alarms SET fired=1 WHERE id=?',[alarm.id]);
    }
  }, delay);
  scheduledTimers.set(alarm.id, timer);
}

export async function rescheduleAllAlarms() {
  try {
    const now=new Date(), ceiling=new Date(now.getTime()+24*60*60*1000);
    const pending=all('SELECT a.*,a.user_id FROM alarms a WHERE a.active=1 AND a.fired=0 AND a.when_time>=? AND a.when_time<=?',
      [now.toISOString(),ceiling.toISOString()]);
    pending.forEach(a=>scheduleAlarmPush(serializeAlarm(a),a.user_id));
    console.log(`[Alarms] Rescheduled ${pending.length} pending alarms`);
  } catch(err){console.warn('[Alarms] Reschedule failed:',err.message);}
}

export default router;
