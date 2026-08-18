import React, { useState } from 'react';
import { useConversation, ConversationProvider } from '@elevenlabs/react';
import { useApp } from '../context/AppContext';

// Helper function for fuzzy matching (Levenshtein distance)
const levenshtein = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

function VoiceBotInner({ onTaskAdd }) {
  const [isActive, setIsActive] = useState(false);
  const { profile, tasks, employees, clients, addTask, updateTask } = useApp();

  // Fix stale closures by keeping latest state in refs
  const latestData = React.useRef({ profile, tasks, employees, clients, addTask, updateTask, companyList: [] });

  // Derive company list: merge active clients + existing task clients
  React.useEffect(() => {
    const taskClients = tasks ? tasks.map(t => t.client).filter(Boolean) : [];
    const taskUniqueCompanies = [...new Set(taskClients)];
    const activeClientNames = (clients || [])
      .filter(item => {
        const isActive = item['Is Active'] || item['isActive'] || item['is_active'] || item['Is active'] || item.isActive;
        return String(isActive).toLowerCase() === 'yes' || isActive === true;
      })
      .map(item => item['Project Name'] || item['Client Name'] || item['Company Name'] || item['Company'] || item['Name'] || '')
      .filter(Boolean);
    const companyList = [...new Set([...activeClientNames, ...taskUniqueCompanies])].filter(c => c && String(c).toLowerCase() !== 'internal');
    
    latestData.current = { profile, tasks, employees, clients, addTask, updateTask, companyList };
  }, [profile, tasks, employees, clients, addTask, updateTask]);

  const executeQueryTasks = (params) => {
      console.log("[VoiceBot] executeQueryTasks called with:", params);
      const { tasks, employees, companyList, profile } = latestData.current;
      let filteredTasks = tasks;
      
      // Filter by Task Query (ID or Title)
      if (params.task_query) {
          const taskQuery = params.task_query.trim().toLowerCase();
          let match = tasks.find(t => String(t.id).toLowerCase() === taskQuery);
          if (!match) {
             let bestMatch = null;
             let minDistance = Infinity;
             tasks.forEach(t => {
                 const title = String(t.title).toLowerCase();
                 const dist = levenshtein(taskQuery, title);
                 if (dist < minDistance) { minDistance = dist; bestMatch = t; }
             });
             if (bestMatch && minDistance <= Math.max(taskQuery.length, 10) * 0.6) { match = bestMatch; }
          }
          if (match) {
              filteredTasks = [match];
          } else {
              return `Here is the data from Dreamsdesk: Could not find any task matching '${params.task_query}'. Please ask the user to clarify the task title or ID.`;
          }
      }

      // Filter by Assignee
      if (params.assignee && filteredTasks.length > 0) {
          const assigneeQuery = params.assignee.trim().toLowerCase();
          let matchEmp = null;
          if (assigneeQuery === 'me' || assigneeQuery === 'myself' || assigneeQuery === 'my') {
              matchEmp = { name: profile?.name || 'User' };
          } else {
              matchEmp = employees?.find(e => e.name.toLowerCase() === assigneeQuery);
              if (!matchEmp) {
                 let bestEmp = null;
                 let minEmpDist = Infinity;
                 employees?.forEach(e => {
                     const lowerE = e.name.toLowerCase();
                     const dist = levenshtein(assigneeQuery, lowerE);
                     const distFirst = levenshtein(assigneeQuery, lowerE.split(' ')[0]);
                     const finalDist = Math.min(dist, distFirst);
                     if (finalDist < minEmpDist) { minEmpDist = finalDist; bestEmp = e; }
                 });
                 if (bestEmp && minEmpDist <= Math.max(assigneeQuery.length, 5) * 0.5) { matchEmp = bestEmp; }
              }
          }
          if (!matchEmp) return `Here is the data from Dreamsdesk: Could not find any employee named '${params.assignee}'. Please ask the user to clarify the employee name.`;
          filteredTasks = filteredTasks.filter(t => t.assignedTo && t.assignedTo.includes(matchEmp.name));
      }

      // Filter by Client
      if (params.client) {
          const clientQuery = params.client.trim().toLowerCase();
          let matchClient = null;
          let minClientDist = Infinity;
          companyList?.forEach(c => {
              const lowerC = String(c).toLowerCase().replace(/clinic|llc|inc|ltd/g, '').trim();
              const cleanQuery = clientQuery.replace(/clinic|llc|inc|ltd/g, '').trim();
              const dist = levenshtein(cleanQuery, lowerC);
              if (dist < minClientDist) { minClientDist = dist; matchClient = c; }
          });
          if (minClientDist > Math.max(clientQuery.length, 5) * 0.5) matchClient = null;
          
          if (!matchClient) return `Here is the data from Dreamsdesk: Could not find any client matching '${params.client}'. Please ask the user to clarify the client name.`;
          filteredTasks = filteredTasks.filter(t => t.client === matchClient);
      }

      // Filter by Due Date Range
      if (params.due_date_from || params.due_date_to) {
          const fromDate = params.due_date_from ? new Date(params.due_date_from) : null;
          const toDate = params.due_date_to ? new Date(params.due_date_to) : null;
          if (fromDate && isNaN(fromDate)) return `Here is the data from Dreamsdesk: The start date '${params.due_date_from}' is not valid. Please ask the user for a valid date.`;
          if (toDate && isNaN(toDate)) return `Here is the data from Dreamsdesk: The end date '${params.due_date_to}' is not valid. Please ask the user for a valid date.`;
          filteredTasks = filteredTasks.filter(t => {
              if (!t.dueDate) return false;
              const taskDate = new Date(t.dueDate);
              if (isNaN(taskDate)) return false;
              if (fromDate && taskDate < fromDate) return false;
              if (toDate && taskDate > new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate(), 23, 59, 59)) return false;
              return true;
          });
      }

      // Filter by Priority
      if (params.priority) {
          const priorityQ = params.priority.toLowerCase();
          filteredTasks = filteredTasks.filter(t => (t.priority || '').toLowerCase() === priorityQ);
      }

      // Filter by Status
      if (params.status) {
          const statusQ = params.status.toLowerCase();
          if (statusQ === 'done' || statusQ === 'completed') {
              filteredTasks = filteredTasks.filter(t => (t.status || '').toLowerCase() === 'done' || (t.status || '').toLowerCase() === 'completed');
          } else if (statusQ === 'pending' || statusQ === 'active') {
              filteredTasks = filteredTasks.filter(t => (t.status || '').toLowerCase() !== 'done' && (t.status || '').toLowerCase() !== 'completed');
          } else {
              filteredTasks = filteredTasks.filter(t => (t.status || '').toLowerCase() === statusQ);
          }
      }

      if (filteredTasks.length === 0) {
          const response = "There are no tasks found matching your request.";
          console.log("[VoiceBot] executeQueryTasks returning to AI:", response);
          return response;
      }

      let response;
      const count = filteredTasks.length;

      if (params.priority) {
          const deptGroups = {};
          filteredTasks.forEach(t => {
              const dept = t.department || 'COMMON';
              if (!deptGroups[dept]) deptGroups[dept] = [];
              deptGroups[dept].push(t);
          });
          const deptLines = [];
          let taskNum = 1;
          Object.entries(deptGroups).forEach(([dept, deptTasks]) => {
              const taskItems = deptTasks.slice(0, 5).map(t => {
                  const parts = [`"${t.title}"`];
                  if (t.client) parts.push(`for ${t.client}`);
                  if (t.status) parts.push(`- status is ${t.status}`);
                  if (t.assignedTo) parts.push(`- assigned to ${t.assignedTo}`);
                  if (t.dueDate) parts.push(`- due ${t.dueDate}`);
                  return `${taskNum++}. ${parts.join(' ')}`;
              });
              deptLines.push(`In ${dept} department: ${taskItems.join(', ')}`);
          });
          if (count === 1) {
              response = `Here is the task data from Dreamsdesk: ${deptLines.join('. ')}. This is the only ${params.priority} priority task found.`;
          } else {
              response = `Here is the task data from Dreamsdesk: ${deptLines.join('. ')}. These are all ${count} ${params.priority} priority tasks found across ${Object.keys(deptGroups).length} departments.`;
          }
      } else {
          const taskLines = filteredTasks.slice(0, 10).map((t, i) => {
              const parts = [`${i + 1}. "${t.title}"`];
              if (t.client) parts.push(`for ${t.client}`);
              if (t.status) parts.push(`- status is ${t.status}`);
              if (t.assignedTo) parts.push(`- assigned to ${t.assignedTo}`);
              return parts.join(' ');
          });
          if (count === 1) {
              response = `Here is the task data from Dreamsdesk: ${taskLines[0]}. This is the only task found.`;
          } else {
              response = `Here is the task data from Dreamsdesk: ${taskLines.join('. ')}. These are all ${count} tasks found.`;
          }
      }
      console.log("[VoiceBot] executeQueryTasks returning to AI:", response);
      return response;
  };

  const resolveEmployee = (nameStr) => {
      if (!nameStr) return null;
      const query = nameStr.trim().toLowerCase();
      const { employees, profile } = latestData.current;
      if (query === 'me' || query === 'myself' || query === 'my') {
          return { name: profile?.name || 'User' };
      }
      let match = employees?.find(e => e.name.toLowerCase() === query);
      if (match) return match;
      let best = null, minDist = Infinity;
      employees?.forEach(e => {
          const lower = e.name.toLowerCase();
          const dist = Math.min(levenshtein(query, lower), levenshtein(query, lower.split(' ')[0]));
          if (dist < minDist) { minDist = dist; best = e; }
      });
      if (best && minDist <= Math.max(query.length, 5) * 0.5) return best;
      return null;
  };

  const checkPermission = (profile, task, action) => {
      if (!profile || !task) return { allowed: false, reason: 'You are not logged in.' };
      if (task.status === 'Done') return { allowed: false, reason: 'This task is already Done and cannot be modified.' };

      const myName = String(profile.name || '').trim().toLowerCase();
      const myEmail = String(profile.email || '').trim().toLowerCase();
      const nameNorm = (n) => String(n || '').toLowerCase().replace(/[^\w]/g, '').trim();
      const assignees = (task.assignedTo || '').split(',').map(nameNorm).filter(Boolean);
      const assigneeEmails = (task.assignedEmail || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const isAssignee = assignees.includes(nameNorm(profile.name)) || (myEmail && assigneeEmails.includes(myEmail));
      const isAssigner = String(task.assignedBy || '').toLowerCase() === myName;
      const role = profile.systemRole || 'Employee';
      const isNonEmp = role !== 'Employee';

      switch (action) {
          case 'status':
          case 'priority':
              if (isNonEmp || isAssignee) return { allowed: true };
              return { allowed: false, reason: `You are not allowed to change the ${action} of this task. Only the assigned user, admins, or managers can change the ${action}.` };
          case 'due_date':
              if (isAssigner) return { allowed: true };
              return { allowed: false, reason: `You are not allowed to change the due date of this task. Only the person who assigned the task (${task.assignedBy || 'the assigner'}) can change the due date.` };
          case 'assignee':
              return { allowed: true };
          case 'remove_self':
              return { allowed: false, reason: 'You cannot remove yourself from the task.' };
          case 'department':
              return { allowed: true };
          case 'delete_task':
              if (role === 'Admin') return { allowed: true };
              return { allowed: false, reason: 'You are not allowed to delete this task. Only Admins can delete tasks.' };
          case 'delete_subtask':
              if (isNonEmp) return { allowed: true };
              return { allowed: false, reason: 'You are not allowed to delete this subtask. Only managers, admins, and department heads can delete subtasks.' };
          case 'add_subtask':
              if (isAssignee || isAssigner || isNonEmp) return { allowed: true };
              return { allowed: false, reason: `You are not allowed to add subtasks to this task. Only users assigned to this task, the person who assigned it, or managers can add subtasks.` };
          default:
              return { allowed: false, reason: `You are not allowed to perform this action.` };
      }
  };

  const executeUpdateTask = (params) => {
      console.log("[VoiceBot] executeUpdateTask called with:", params);
      const { tasks, updateTask, profile } = latestData.current;
      const taskQuery = (params.task_query || params.task_name || params.title || '').trim().toLowerCase();
      
      if (!taskQuery) {
          return `Here is the data from Dreamsdesk: No task was specified. Please tell me which task you want to update.`;
      }

      let match = tasks.find(t => String(t.id).toLowerCase() === taskQuery);
      if (!match) {
         let bestMatch = null;
         let minDistance = Infinity;
         tasks.filter(t => t.status !== 'Done').forEach(t => {
             const title = String(t.title).toLowerCase();
             const dist = levenshtein(taskQuery, title);
             if (dist < minDistance) { minDistance = dist; bestMatch = t; }
         });
         if (bestMatch && minDistance <= Math.max(taskQuery.length, 10) * 0.6) { match = bestMatch; }
      }

      if (!match) {
          return `Here is the data from Dreamsdesk: I could not find an active task matching '${params.task_query || taskQuery}'. Please ask the user to clarify the task title or ID.`;
      }

      let updates = {};
      let successMessages = [];

      const newStatus = params.new_status || params.status;
      if (newStatus && ['pending', 'in progress', 'review', 'done', 'blocked'].includes(newStatus.toLowerCase())) {
          const perm = checkPermission(profile, match, 'status');
          if (!perm.allowed) return `Here is the data from Dreamsdesk: ${perm.reason}`;
          updates.status = newStatus;
          successMessages.push(`Status changed to ${newStatus}`);
      }

      const newDepartment = params.new_department || params.department;
      if (newDepartment) {
          updates.department = newDepartment.toUpperCase();
          successMessages.push(`Department changed to ${newDepartment}`);
      }

      const addAssigneeStr = params.new_assignee || params.add_assignee || params.assignee;
      if (addAssigneeStr && addAssigneeStr.toLowerCase() !== 'unassigned') {
          const empMatch = resolveEmployee(addAssigneeStr);
          if (empMatch) {
              const myEmail = String(profile?.email || '').trim().toLowerCase();
              const empEmail = String(empMatch.email || '').trim().toLowerCase();
              if (myEmail && empEmail && myEmail === empEmail) {
                  return `Here is the data from Dreamsdesk: ${checkPermission(profile, match, 'remove_self').reason}`;
              }
              const currentAssignees = match.assignedTo ? match.assignedTo.split(',').map(s => s.trim()) : [];
              if (!currentAssignees.includes(empMatch.name)) {
                  currentAssignees.push(empMatch.name);
                  updates.assignedTo = currentAssignees.join(', ');
                  successMessages.push(`Assigned to ${empMatch.name}`);
              } else {
                  successMessages.push(`${empMatch.name} is already assigned`);
              }
          } else {
              return `ERROR: I found the task, but I could not find any employee named '${addAssigneeStr}'.`;
          }
      }

      if (params.remove_assignee) {
          const empMatch = resolveEmployee(params.remove_assignee);
          if (empMatch) {
              const myEmail = String(profile?.email || '').trim().toLowerCase();
              const empEmail = String(empMatch.email || '').trim().toLowerCase();
              if (myEmail && empEmail && myEmail === empEmail) {
                  return `Here is the data from Dreamsdesk: ${checkPermission(profile, match, 'remove_self').reason}`;
              }
              let currentAssignees = match.assignedTo ? match.assignedTo.split(',').map(s => s.trim()).filter(Boolean) : [];
              if (currentAssignees.includes(empMatch.name)) {
                  currentAssignees = currentAssignees.filter(name => name !== empMatch.name);
                  if (currentAssignees.length > 0) {
                      updates.assignedTo = currentAssignees.join(', ');
                      updates.assignedToIds = currentAssignees.map(n => employees?.find(e => e.name === n)?.id).filter(Boolean).join(', ');
                  } else {
                      const me = employees?.find(e =>
                          String(e.id || '').trim().toLowerCase() === String(profile?.employeeId || profile?.id || '').trim().toLowerCase()
                      );
                      updates.assignedTo = me?.name || profile?.name || 'User';
                      updates.assignedToIds = me?.id || profile?.employeeId || profile?.id || '';
                  }
                  successMessages.push(`Removed ${empMatch.name} from task`);
              } else {
                  successMessages.push(`${empMatch.name} is not assigned to this task`);
              }
          } else {
              return `ERROR: I found the task, but I could not find any employee named '${params.remove_assignee}'.`;
          }
      }

      const newPriority = params.priority || params.new_priority;
      if (newPriority && ['low', 'medium', 'high', 'urgent'].includes(newPriority.toLowerCase())) {
          const perm = checkPermission(profile, match, 'priority');
          if (!perm.allowed) return `Here is the data from Dreamsdesk: ${perm.reason}`;
          const capped = newPriority.charAt(0).toUpperCase() + newPriority.slice(1).toLowerCase();
          updates.priority = capped;
          successMessages.push(`Priority changed to ${capped}`);
      }

      const newDueDate = params.due_date || params.deadline;
      if (newDueDate) {
          const perm = checkPermission(profile, match, 'due_date');
          if (!perm.allowed) return `Here is the data from Dreamsdesk: ${perm.reason}`;
          try {
              const parsed = new Date(newDueDate);
              if (!isNaN(parsed)) {
                  updates.dueDate = parsed.toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata'
                  });
                  successMessages.push(`Due date changed to ${updates.dueDate}`);
              }
          } catch { /* ignore invalid date */ }
      }

      if (Object.keys(updates).length > 0) {
         updateTask(match.id, updates);
         return `Here is the update data from Dreamsdesk: Task "${match.title}" has been updated. ${successMessages.join('. ')}. This change is now saved in the system.`;
      } else {
          return `Here is the data from Dreamsdesk: I found the task "${match.title}" but no changes were specified. Please tell me what to update: status, department, assignee, priority, or due date.`;
      }
  };

  const executeAddSubtask = (params) => {
      console.log("[VoiceBot] executeAddSubtask called with:", params);
      const { profile, tasks, employees, addTask } = latestData.current;
      const parentQuery = (params.parent_task_id || params.parent_task || params.task_query || '').trim().toLowerCase();

      if (!parentQuery) {
          return `Here is the data from Dreamsdesk: No parent task was specified. Please tell me which task to add the subtask to.`;
      }

      let parentMatch = tasks.find(t => String(t.id).toLowerCase() === parentQuery);
      if (!parentMatch) {
          let best = null, minDist = Infinity;
          tasks.filter(t => t.status !== 'Done').forEach(t => {
              const title = String(t.title).toLowerCase();
              const dist = levenshtein(parentQuery, title);
              if (dist < minDist) { minDist = dist; best = t; }
          });
          if (best && minDist <= Math.max(parentQuery.length, 10) * 0.6) parentMatch = best;
      }

      if (!parentMatch) {
          return `Here is the data from Dreamsdesk: I could not find a parent task matching '${parentQuery}'. Please ask the user to clarify.`;
      }

      const perm = checkPermission(profile, parentMatch, 'add_subtask');
      if (!perm.allowed) return `Here is the data from Dreamsdesk: ${perm.reason}`;

      if (!params.title || !params.title.trim()) {
          return `Here is the data from Dreamsdesk: No subtask title was provided. Please ask the user for the subtask title.`;
      }

      // Calculate subtask ID
      let maxSubIdNum = 0;
      const existingSubtasks = tasks.filter(t => String(t.mainTaskId) === String(parentMatch.id) && (t.taskType === 'Sub Task' || t.taskType === 'Subtask'));
      existingSubtasks.forEach(st => {
          const match = String(st.id).match(/-(\d+)$/);
          if (match) { const num = parseInt(match[1], 10); if (num > maxSubIdNum) maxSubIdNum = num; }
      });
      const nextSubIdNum = maxSubIdNum + 1;
      // Timestamp suffix keeps subtask IDs unique even when two users add at the same time
      const newStId = `${parentMatch.id}-${String(nextSubIdNum).padStart(2, '0')}${Date.now().toString().slice(-6)}`;

      // Resolve assignee
      let assigneeName = '';
      let assigneeEmps = [];
      if (params.assignee && params.assignee.toLowerCase() !== 'unassigned') {
          const emp = resolveEmployee(params.assignee);
          if (emp) {
              assigneeName = emp.name;
              assigneeEmps = [emp];
          }
      }
      if (!assigneeName) {
          const me = employees?.find(e =>
              String(e.id || '').trim().toLowerCase() === String(profile?.employeeId || profile?.id || '').trim().toLowerCase()
          );
          assigneeName = me?.name || profile?.name || 'User';
          if (me) assigneeEmps = [me];
      }

      // Parse due date
      let dueDate = '';
      if (params.due_date || params.deadline) {
          try {
              const d = new Date(params.due_date || params.deadline);
              if (!isNaN(d)) {
                  dueDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' });
              }
          } catch {}
      }

      let calculatedOverdue = 'No';
      if (dueDate) {
          const dueTime = new Date(dueDate).setHours(23, 59, 59, 999);
          if (dueTime < Date.now()) calculatedOverdue = 'Yes';
      }

      const newSubtask = {
          id: newStId,
          title: params.title.trim(),
          taskType: 'Sub Task',
          mainTaskId: parentMatch.id,
          client: parentMatch.client,
          project: parentMatch.project,
          department: parentMatch.department,
          status: 'Pending',
          assignedTo: assigneeName,
          assignedToIds: assigneeEmps.map(e => e.id).filter(Boolean).join(', '),
          assignedBy: profile?.name || 'System',
          assignedById: profile?.employeeId || profile?.id || '',
          employeeIds: assigneeEmps.map(e => e.id).filter(Boolean).join(', '),
          employeeId: assigneeEmps.map(e => e.id).filter(Boolean).join(', '),
          assignedEmails: assigneeEmps.map(e => e.email).filter(Boolean).join(', '),
          assignedEmail: assigneeEmps.map(e => e.email).filter(Boolean).join(', '),
          priority: params.priority || 'Medium',
          dueDate: dueDate,
          daysOverdue: calculatedOverdue,
          description: { intro: (params.description || '').trim() || 'Added via Voice Assistant.', bullets: [], outro: '' }
      };

      if (addTask) addTask(newSubtask, { addToSheet: true });

      const result = `Here is the data from Dreamsdesk: Subtask "${newSubtask.title}" has been added to task "${parentMatch.title}". It is assigned to ${assigneeName || 'no one'} with ${newSubtask.priority} priority.`;
      try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
      return result;
  };

  const conversation = useConversation({
    onConnect: () => {
      setIsActive(true);
    },
    onDisconnect: () => {
      setIsActive(false);
    },
    onMessage: (message) => {
      console.log('AI Message:', message);
    },
    onError: (error) => {
      console.error('AI Error:', error);
      setIsActive(false);
    },
    onAgentToolResponse: (event) => {
      console.log('[VoiceBot] AI processed tool response:', event);
    },
    onDebug: (event) => {
      if (event?.type === 'client_tool_call' || event?.type === 'client_tool_result') {
        console.log('[VoiceBot] Debug:', event.type, event);
      }
    },
    clientTools: {
      get_team_status: async () => {
        const { employees } = latestData.current;
        const online = employees.filter(e => e.status === 'Online').map(e => e.name);
        const result = `Currently Online Team Members: ${online.join(', ') || 'No one'}. Offline Members: ${employees.filter(e => e.status !== 'Online').map(e => e.name).join(', ') || 'No one'}.`;
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      },

      get_employee_tasks: async (params) => {
        const result = executeQueryTasks({
          ...params,
          assignee: params.employee_name || params.assignee,
        });
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      },

      task_query: async (params) => {
        const result = executeQueryTasks(params);
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      },

      query_tasks: async (params) => {
        const result = executeQueryTasks(params);
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      },

      update_task: async (params) => {
        const result = executeUpdateTask(params);
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      },

      update_task_status: async (params) => {
        const result = executeUpdateTask(params);
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      },

      add_task: async (params) => {
        console.log("[VoiceBot] add_task called with:", params);
        
        const { employees, companyList, tasks, profile } = latestData.current;

        if (!params.title || !params.title.trim()) {
            return "Here is the data from Dreamsdesk: No task title was provided. Please ask the user for the task title.";
        }

        if (!params.client || !params.client.trim()) {
            return "Here is the data from Dreamsdesk: No client name was provided. Please ask the user which client this task is for.";
        }

        if (!params.assignee || !params.assignee.trim()) {
            return "Here is the data from Dreamsdesk: No assignee was provided. Please ask the user who should work on this task.";
        }

        // Client Validation & Fuzzy Matching
        const providedClient = (params.client || '').trim();
        let validClientName = companyList?.[0] || 'General';

        if (providedClient) {
          const lowerProvided = providedClient.toLowerCase();
          // Try exact match first
          let match = companyList?.find(c => c.toLowerCase() === lowerProvided);
          
          // Try advanced fuzzy match if exact fails
          if (!match) {
             console.log("[VoiceBot] Exact client match failed. Starting fuzzy match...");
             const ignoreWords = ['clinic', 'hospital', 'inc', 'llc', 'co', 'the', 'private', 'ltd'];
             const providedWords = lowerProvided.split(' ').filter(w => !ignoreWords.includes(w) && w.length > 1);
             console.log("[VoiceBot] Client provided words after ignoring common words:", providedWords);
             console.log("[VoiceBot] Available companyList:", companyList);
             
             if (providedWords.length > 0) {
                 const possibleMatches = companyList?.filter(c => {
                     const cWords = c.toLowerCase().split(' ');
                     // Check if ANY meaningful provided word matches ANY company word with <= 2 typos
                     const hasMatch = providedWords.some(pw => cWords.some(cw => {
                         const dist = levenshtein(pw, cw);
                         // Match if levenshtein distance is small, OR if one word contains the other (e.g. 'tiny' in 'tinybit')
                         return dist <= 2 || cw.includes(pw) || pw.includes(cw);
                     }));
                     return hasMatch;
                 });

                 console.log("[VoiceBot] Possible Client Matches found:", possibleMatches);

                 // If we narrowed it down to exactly one company, we found it!
                 if (possibleMatches && possibleMatches.length === 1) {
                     match = possibleMatches[0];
                 } else if (possibleMatches && possibleMatches.length > 1) {
                     // If multiple companies share this word, find the one with the smallest total distance
                     let bestMatch = null;
                     let minDistance = Infinity;
                     possibleMatches.forEach(c => {
                         const dist = levenshtein(lowerProvided, c.toLowerCase());
                         if (dist < minDistance) {
                             minDistance = dist;
                             bestMatch = c;
                         }
                     });
                     if (bestMatch) match = bestMatch;
                 }
             }
          }

          if (match) {
            console.log(`[VoiceBot] SUCCESS: Fuzzy matched client to: "${match}"`);
            validClientName = match;
          } else {
              throw new Error(`Here is the data from Dreamsdesk: The client '${providedClient}' does not exist in our system. Please ask the user for the correct client name.`);
          }
        }

        // Calculate next ID
        let maxIdNum = 0;
        if (tasks && tasks.length > 0) {
          tasks.forEach(t => {
            if (t.id && (!t.taskType || t.taskType === 'Main Task' || t.taskType === 'Task') && String(t.id).match(/^T-\d+$/)) {
              const match = String(t.id).match(/^T-(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxIdNum) maxIdNum = num;
              }
            }
          });
        }
        const nextIdNum = maxIdNum > 0 ? maxIdNum + 1 : 1;
        // Timestamp suffix keeps task IDs unique even when two users create at the same time
        const nextIdStr = `T-${String(nextIdNum).padStart(4, '0')}${Date.now().toString().slice(-6)}`;

        // Get Assignees with Validation & Fuzzy Matching
        const rawAssignee = params.assignee;
        let validAssigneeNames = [];
        let assignedEmps = [];

        if (rawAssignee && rawAssignee.toLowerCase() !== 'unassigned') {
          const namesToMatch = rawAssignee.split(',').map(s => s.trim().toLowerCase());
          
          for (const name of namesToMatch) {
             let match;
             if (name === 'me' || name === 'myself' || name === 'my') {
                 match = { name: profile?.name || 'User' };
             } else {
                 match = employees?.find(e => e.name.toLowerCase() === name);
                 if (!match) {
                    console.log(`[VoiceBot] Exact assignee match failed for "${name}". Starting fuzzy match...`);
                    let bestMatch = null;
                    let minDistance = Infinity;
                    employees?.forEach(e => {
                        const lowerE = e.name.toLowerCase();
                        const dist = levenshtein(name, lowerE);
                        // Check against just the first name for better matching
                        const firstName = lowerE.split(' ')[0];
                        const distFirst = levenshtein(name, firstName);
                        const finalDist = Math.min(dist, distFirst);
                        
                        if (finalDist < minDistance) {
                            minDistance = finalDist;
                            bestMatch = e;
                        }
                    });
                    console.log(`[VoiceBot] Best fuzzy match for "${name}" is "${bestMatch?.name}" with distance ${minDistance}`);
                    // If distance is less than 50% of length, accept it
                    if (bestMatch && minDistance <= Math.max(name.length, 5) * 0.5) {
                       console.log(`[VoiceBot] Distance ${minDistance} is acceptable. Using "${bestMatch.name}".`);
                       match = bestMatch;
                    } else {
                       console.log(`[VoiceBot] Distance ${minDistance} is TOO HIGH. Match rejected.`);
                    }
                 }
             }

             if (match) {
                validAssigneeNames.push(match.name);
                assignedEmps.push(match);
             } else {
                 throw new Error(`Here is the data from Dreamsdesk: Could not find any employee named '${name}'. Please ask the user to clarify the employee's name.`);
             }
          }
        } else {
          const me = employees?.find(e =>
            String(e.id || '').trim().toLowerCase() === String(profile?.employeeId || profile?.id || '').trim().toLowerCase()
          )
          validAssigneeNames.push(me?.name || profile?.name || 'User')
          if (me) assignedEmps.push(me)
        }

        const assigneeString = validAssigneeNames.join(', ');

        // Format Date
        let formattedDate = '';
        if (params.deadline) {
           try {
             formattedDate = new Date(params.deadline).toLocaleDateString('en-US', {
               month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata'
             });
           } catch { /* invalid date, leave formattedDate empty */ }
        }

        const newTask = {
          id: nextIdStr,
          title: (params.title || 'Voice Task').trim(),
          client: validClientName,
          project: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }),
          assigned: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
          assignedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
          dueDate: formattedDate,
          priority: params.priority || 'Medium',
          status: 'Pending',
          statusUpdatedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata' }),
          overdue: false,
          done: false,
          department: params.department || 'COMMON',
          assignedTo: assigneeString,
          assignedToIds: assignedEmps.map(e => e.id).filter(Boolean).join(', '),
          assignedBy: profile?.name || 'System',
          assignedById: profile?.employeeId || profile?.id || '',
          employeeIds: assignedEmps.map(e => e.id).filter(Boolean).join(', '),
          employeeId: assignedEmps.map(e => e.id).filter(Boolean).join(', '),
          assignedEmails: assignedEmps.map(e => e.email).filter(Boolean).join(', '),
          assignedEmail: assignedEmps.map(e => e.email).filter(Boolean).join(', '),
          description: {
            intro: (params.description || '').trim() || 'Added via Voice Assistant.',
            bullets: [],
            outro: '',
          },
          comments: [],
          attachments: [],
          remarks: params.remarks || '',
          post: 'YES',
          isRecurring: false,
          recurringSchedule: '',
          recurringDay: '',
          recurringMonths: '',
        };

        if (onTaskAdd) {
          onTaskAdd(newTask);
        }
        const addResult = `Here is the data from Dreamsdesk: Task "${newTask.title}" has been created for ${validClientName}, assigned to ${assigneeString}. The status is Pending. This task is now saved in the system.`;
        try { conversation.sendContextualUpdate(addResult); } catch { /* ignore */ }
        return addResult;
      },

      add_subtask: async (params) => {
        const result = executeAddSubtask(params);
        try { conversation.sendContextualUpdate(result); } catch { /* ignore */ }
        return result;
      }
    }
  });

  const toggleConversation = async () => {
    if (isActive) {
      await conversation.endSession();
    } else {
      const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID || '';
      if (!agentId || agentId === 'your-elevenlabs-agent-id') {
        alert("ElevenLabs Agent ID not configured. Please set VITE_ELEVENLABS_AGENT_ID in your .env file with a valid ElevenLabs Agent ID.");
        return;
      }
      
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (micErr) {
        console.error("Microphone Error:", micErr);
        alert("Microphone Error: " + micErr.message + ". Please allow microphone access in your browser settings.");
        return;
      }

      try {
        await conversation.startSession({
          agentId: agentId
        });
      } catch (agentErr) {
        console.error("ElevenLabs Error:", agentErr);
        alert("ElevenLabs Error: " + agentErr.message + ". Check if the Agent ID is correct and if the Agent is public.");
      }
    }
  };

  const [hovered, setHovered] = useState(false);
  const btnStyle = isActive ? {
    height: 44,
    width: 'auto',
    minWidth: 44,
    background: '#ef4444',
    color: 'white',
    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4)',
    padding: '0 16px 0 12px',
    gap: '8px',
  } : {
    height: 44,
    width: 'auto',
    minWidth: 44,
    maxWidth: hovered ? 200 : 44,
    background: 'linear-gradient(to right, rgb(112, 44, 145), rgb(236, 0, 140))',
    color: 'white',
    boxShadow: 'rgba(91, 33, 182, 0.06) 0px 2px 8px',
    padding: hovered ? '0 16px 0 14px' : '0',
    gap: hovered ? '8px' : '0',
    cursor: 'pointer',
  };

  return (
    <div
      onClick={toggleConversation}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-full flex items-center justify-center overflow-hidden whitespace-nowrap"
      style={{
        ...btnStyle,
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
        fontWeight: 700,
        transition: 'max-width 0.35s ease-out, padding 0.35s ease-out, gap 0.35s ease-out, box-shadow 0.3s ease-out',
      }}
      title="Voice AI Assistant"
    >
      {isActive ? (
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
          <span className="material-symbols-outlined text-[20px]">mic_off</span>
          <span className="font-bold text-sm">Stop Listening</span>
        </div>
      ) : (
        <span className="material-symbols-outlined text-[20px]" style={{ fontSize: 20 }}>mic</span>
      )}
    </div>
  );
}

export default function VoiceBot(props) {
  return (
    <ConversationProvider>
      <VoiceBotInner {...props} />
    </ConversationProvider>
  );
}
