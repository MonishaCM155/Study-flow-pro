// routes/friends.js — sql.js version
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { run, get, all, fromJson } from '../db.js';
import authMiddleware from '../middleware/auth.js';
import { sendInviteEmail } from '../services/email.js';
import { awardXp, checkAndUnlockBadges } from '../services/gamification.js';

const router = Router();

function parseFriend(u) {
  return { id:u.id, name:u.name, email:u.email, role:u.role||'Student',
    subjects:fromJson(u.subjects,[]), streak:u.streak||0 };
}

/* LIST FRIENDS + INVITES */
router.get('/', authMiddleware, (req,res) => {
  try {
    const fs1=all(`SELECT u.* FROM friendships f JOIN users u ON u.id=f.user_b_id WHERE f.user_a_id=?`,[req.user.id]);
    const fs2=all(`SELECT u.* FROM friendships f JOIN users u ON u.id=f.user_a_id WHERE f.user_b_id=?`,[req.user.id]);
    const friends=[...fs1,...fs2].map(parseFriend);
    const invites=all('SELECT * FROM friend_invites WHERE sender_id=? ORDER BY created_at DESC',[req.user.id]);
    res.json({friends, invites:invites.map(i=>({...i,group:i.group_name}))});
  } catch(err){console.error('[Friends/list]',err);res.status(500).json({error:'Failed to fetch friends'});}
});

/* SEND INVITE */
router.post('/invite', authMiddleware, async (req,res) => {
  const {email,name,group} = req.body;
  if (!name?.trim()) return res.status(400).json({error:'Name required'});
  if (!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Valid email required'});
  if (email.toLowerCase()===req.user.email) return res.status(400).json({error:"Can't invite yourself"});
  try {
    const pending=get('SELECT id FROM friend_invites WHERE sender_id=? AND email=? AND status=?',
      [req.user.id,email.toLowerCase(),'pending']);
    if (pending) return res.status(409).json({error:'Invite already sent to this email'});
    const token=uuid();
    const id=uuid();
    const receiver=get('SELECT id FROM users WHERE email=?',[email.toLowerCase()]);
    run(`INSERT INTO friend_invites(id,sender_id,receiver_id,email,name,group_name,token) VALUES(?,?,?,?,?,?,?)`,
      [id, req.user.id, receiver?.id||null, email.toLowerCase(), name.trim(), group||'Study Group', token]);
    const invite=get('SELECT * FROM friend_invites WHERE id=?',[id]);
    let warning=null;
    try {
      await sendInviteEmail({to:email,toName:name,fromName:req.user.name,group:group||'Study Group',
        inviteToken:token, appUrl:process.env.FRONTEND_URL||`http://localhost:${process.env.PORT||3001}`});
    } catch(emailErr){
      console.warn('[Invite] Email failed:',emailErr.message);
      warning='Invite saved but email delivery failed. Check SMTP config in .env';
    }
    res.status(201).json({invite:{...invite,group:invite.group_name}, warning,
      gamification: (() => { const xp=awardXp(req.user.id,'friend_invited'); return {xp, unlockedBadges:xp.unlockedBadges}; })()});
  } catch(err){console.error('[Friends/invite]',err);res.status(500).json({error:'Failed to send invite'});}
});

/* ACCEPT INVITE */
router.post('/accept/:token', (req,res) => {
  try {
    const invite=get('SELECT * FROM friend_invites WHERE token=?',[req.params.token]);
    if (!invite) return res.status(404).json({error:'Invalid or expired invite'});
    if (invite.status!=='pending') return res.status(400).json({error:`Invite already ${invite.status}`});
    const receiver=get('SELECT id,email FROM users WHERE email=?',[invite.email]);
    if (!receiver) return res.json({requiresRegistration:true,inviteEmail:invite.email,inviteName:invite.name,token:req.params.token});
    const fsId=uuid();
    try { run('INSERT INTO friendships(id,user_a_id,user_b_id) VALUES(?,?,?)',[fsId,invite.sender_id,receiver.id]); } catch{}
    run('UPDATE friend_invites SET status=?,receiver_id=? WHERE token=?',['accepted',receiver.id,req.params.token]);
    res.json({accepted:true,message:'You are now friends on StudyFlow Pro!'});
  } catch(err){res.status(500).json({error:'Failed to accept invite'});}
});

/* CANCEL INVITE */
router.delete('/invite/:id', authMiddleware, (req,res) => {
  try {
    const invite=get('SELECT id FROM friend_invites WHERE id=? AND sender_id=?',[req.params.id,req.user.id]);
    if (!invite) return res.status(404).json({error:'Invite not found'});
    run('DELETE FROM friend_invites WHERE id=?',[req.params.id]);
    res.json({ok:true});
  } catch(err){res.status(500).json({error:'Failed to cancel invite'});}
});

export default router;
