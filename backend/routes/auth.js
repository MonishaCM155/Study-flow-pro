// routes/auth.js — sql.js version
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { run, get, toJson, fromJson } from '../db.js';
import authMiddleware from '../middleware/auth.js';

const router = Router();
const tokenTTL = process.env.JWT_EXPIRES_IN || '30d';
const makeToken = userId => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: tokenTTL });

export function parseUser(u) {
  if (!u) return null;
  return { id:u.id, name:u.name, email:u.email, role:u.role,
    subjects:fromJson(u.subjects,[]), goals:fromJson(u.goals,[]),
    streak:u.streak||0, xp:u.xp||0, level:u.level||1, createdAt:u.created_at };
}

router.post('/register', async (req,res) => {
  const {name,email,password} = req.body;
  if (!name?.trim()||name.trim().length<2) return res.status(400).json({error:'Name must be 2+ chars'});
  if (!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Invalid email'});
  if (!password||password.length<6) return res.status(400).json({error:'Password must be 6+ chars'});
  try {
    if (get('SELECT id FROM users WHERE email=?',[email.toLowerCase()])) return res.status(409).json({error:'Email already registered'});
    const id=uuid(), hashed=await bcrypt.hash(password,12);
    run('INSERT INTO users(id,name,email,password) VALUES(?,?,?,?)',[id,name.trim(),email.toLowerCase(),hashed]);
    const user=get('SELECT * FROM users WHERE id=?',[id]);
    res.status(201).json({token:makeToken(id), user:parseUser(user)});
  } catch(err){console.error('[Auth/register]',err);res.status(500).json({error:'Registration failed'});}
});

router.post('/login', async (req,res) => {
  const {email,password} = req.body;
  if (!email||!password) return res.status(400).json({error:'Email and password required'});
  try {
    const user=get('SELECT * FROM users WHERE email=?',[email.toLowerCase()]);
    if (!user||!(await bcrypt.compare(password,user.password))) return res.status(401).json({error:'Invalid email or password'});
    res.json({token:makeToken(user.id), user:parseUser(user)});
  } catch(err){res.status(500).json({error:'Login failed'});}
});

router.get('/me', authMiddleware, (req,res) => {
  const user=get('SELECT * FROM users WHERE id=?',[req.user.id]);
  res.json({user:parseUser(user)});
});

router.put('/me', authMiddleware, async (req,res) => {
  const {name,email,role,subjects,goals,password} = req.body;
  try {
    const sets=[], params=[];
    if (name?.trim()){sets.push('name=?');params.push(name.trim());}
    if (role){sets.push('role=?');params.push(role);}
    if (subjects){sets.push('subjects=?');params.push(toJson(subjects));}
    if (goals){sets.push('goals=?');params.push(toJson(goals));}
    if (email&&email.toLowerCase()!==req.user.email){
      if (get('SELECT id FROM users WHERE email=?',[email.toLowerCase()])) return res.status(409).json({error:'Email in use'});
      sets.push('email=?');params.push(email.toLowerCase());
    }
    if (password&&password.length>=6){sets.push('password=?');params.push(await bcrypt.hash(password,12));}
    if (sets.length){sets.push("updated_at=datetime('now')");params.push(req.user.id);run(`UPDATE users SET ${sets.join(',')} WHERE id=?`,params);}
    const user=get('SELECT * FROM users WHERE id=?',[req.user.id]);
    res.json({user:parseUser(user)});
  } catch(err){res.status(500).json({error:'Update failed'});}
});

router.post('/push-subscribe', authMiddleware, (req,res) => {
  const {subscription}=req.body;
  if (!subscription) return res.status(400).json({error:'Missing subscription'});
  run('UPDATE users SET push_sub=? WHERE id=?',[JSON.stringify(subscription),req.user.id]);
  res.json({ok:true});
});

export default router;
