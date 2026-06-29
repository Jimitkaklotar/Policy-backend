const express = require('express');
const router = express.Router();
const { readTable, writeTable } = require('../db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/tasks
router.get('/', authMiddleware, (req, res) => {
  const tasks = readTable('tasks');
  // Sort tasks: To Do -> In Progress -> Completed, and then by high priority first
  const priorityWeight = { High: 3, Medium: 2, Low: 1 };
  
  tasks.sort((a, b) => {
    // Sort by status completed last
    if (a.status === 'Completed' && b.status !== 'Completed') return 1;
    if (a.status !== 'Completed' && b.status === 'Completed') return -1;
    
    // Sort by priority weight
    const pA = priorityWeight[a.priority] || 0;
    const pB = priorityWeight[b.priority] || 0;
    if (pA !== pB) return pB - pA;
    
    // Sort by due date
    return a.dueDate.localeCompare(b.dueDate);
  });
  
  res.json(tasks);
});

// POST /api/tasks
router.post('/', authMiddleware, (req, res) => {
  const { title, dueDate, priority, status } = req.body;
  if (!title) {
    return res.status(400).json({ message: 'Title is required' });
  }

  const tasks = readTable('tasks');
  const newTask = {
    id: 'task-' + Math.floor(1000 + Math.random() * 9000),
    title,
    dueDate: dueDate || new Date().toISOString().split('T')[0],
    priority: priority || 'Medium',
    status: status || 'To Do',
    createdAt: new Date().toISOString()
  };

  tasks.push(newTask);
  writeTable('tasks', tasks);
  res.status(201).json(newTask);
});

// PUT /api/tasks/:id
router.put('/:id', authMiddleware, (req, res) => {
  const tasks = readTable('tasks');
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ message: 'Task not found' });
  }

  const { title, dueDate, priority, status } = req.body;
  const updatedTask = {
    ...tasks[idx],
    title: title !== undefined ? title : tasks[idx].title,
    dueDate: dueDate !== undefined ? dueDate : tasks[idx].dueDate,
    priority: priority !== undefined ? priority : tasks[idx].priority,
    status: status !== undefined ? status : tasks[idx].status
  };

  tasks[idx] = updatedTask;
  writeTable('tasks', tasks);
  res.json(updatedTask);
});

// DELETE /api/tasks/:id
router.delete('/:id', authMiddleware, (req, res) => {
  const tasks = readTable('tasks');
  const filteredTasks = tasks.filter(t => t.id !== req.params.id);
  writeTable('tasks', filteredTasks);
  res.json({ message: 'Task deleted successfully' });
});

module.exports = router;
