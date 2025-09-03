/* support.js

Handles donations & crowdfunding interactions for support.html using:

Flutterwave donate link (payment) — quick redirect approach

Firestore (Firebase) to record donations, update project progress, and maintain donor leaderboard


NOTE: This file expects firebase-config.js to initialize Firebase and expose firebase global (compat SDK used in HTML).

Replace FLUTTERWAVE_DONATE_LINK with your payment link if it changes. For a tighter integration use Flutterwave's Inline JS SDK or server-side payment session flows. */

// === Configuration === const FLUTTERWAVE_DONATE_LINK = 'https://flutterwave.com/donate/jjejspsyo9eh'; // provided link const DONATIONS_COLLECTION = 'donations'; const PROJECTS_COLLECTION = 'projects';

// Utility: format Naira function formatNaira(n){ return '₦' + Number(n).toLocaleString('en-NG'); }

// Record a donation in Firestore async function recordDonation({amount, donorName = 'Anonymous', message = '', projectId = null}){ try{ const db = firebase.firestore(); const docRef = await db.collection(DONATIONS_COLLECTION).add({ amount: Number(amount), donorName, message, projectId: projectId || null, createdAt: firebase.firestore.FieldValue.serverTimestamp() });

// If donation to a project, update the project's raised amount
if(projectId){
  const projectRef = db.collection(PROJECTS_COLLECTION).doc(projectId);
  await db.runTransaction(async (tx)=>{
    const projDoc = await tx.get(projectRef);
    if(!projDoc.exists){
      // If project doesn't exist, create a minimal doc
      tx.set(projectRef, { goal: 0, raised: Number(amount) });
    } else {
      const prevRaised = projDoc.data().raised || 0;
      tx.update(projectRef, { raised: prevRaised + Number(amount) });
    }
  });
}

updateLeaderboard();
updateProjectListUI();
return docRef.id;

}catch(err){ console.error('Failed to record donation', err); throw err; } }

// Open Flutterwave donation link in new window with optional amount query (if supported by your link) function openFlutterwaveLink(amount){ // Some payment links support passing amount as a query param, some don't. // We'll append ?amount= as a convenience — verify with Flutterwave if your link accepts it. const url = FLUTTERWAVE_DONATE_LINK + (amount ? ?amount=${encodeURIComponent(amount)} : ''); window.open(url, '_blank'); }

// Public API called by buttons async function donate(amount){ try{ if(!amount || Number(amount) <= 0) return alert('Invalid donation amount');

// Optional: prompt for donor name and message
const donorName = prompt('Your name (or leave blank for Anonymous)') || 'Anonymous';
const message = prompt('Leave a short message (optional)') || '';

// Record donation intent locally first — this is optimistic logging. Real confirmation should come from payment webhook.
await recordDonation({amount, donorName, message});

// Open payment link
openFlutterwaveLink(amount);

alert('Thanks! A new window/tab will open to complete the payment. After payment, we recommend verifying the donation via the admin dashboard.');

}catch(err){ alert('Error while processing donation. Please try again.'); } }

// Handle custom donation form submission document.addEventListener('DOMContentLoaded', ()=>{ const form = document.getElementById('customDonationForm'); if(form){ form.addEventListener('submit', async (e)=>{ e.preventDefault(); const amtInput = document.getElementById('customAmount'); const amount = Number(amtInput.value); if(!amount || amount <= 0){ alert('Enter a valid amount'); return; } await donate(amount); amtInput.value = ''; }); }

// Wire up quick donate buttons (if present as inline onclicks they will use global donate) // Setup donor leaderboard and projects UI updateLeaderboard(); updateProjectListUI(); });

// Donate to specific project async function donateToProject(projectId){ try{ const amountStr = prompt('Enter amount to contribute to this project (₦)'); const amount = Number(amountStr); if(!amount || amount <= 0) return alert('Invalid amount');

const donorName = prompt('Your name (or leave blank for Anonymous)') || 'Anonymous';
const message = prompt('Leave a short message (optional)') || '';

// Record donation linked to project before redirect
await recordDonation({amount, donorName, message, projectId});

// Open payment link
openFlutterwaveLink(amount);
alert('Thanks — payment window opened. We recorded your contribution pending confirmation.');

}catch(err){ alert('Failed to initiate project donation.'); } }

// UI: Update donor leaderboard async function updateLeaderboard(){ try{ const db = firebase.firestore(); const snapshot = await db.collection(DONATIONS_COLLECTION).orderBy('amount','desc').limit(10).get(); const ul = document.getElementById('donorLeaderboard'); if(!ul) return; ul.innerHTML = ''; snapshot.forEach(doc=>{ const d = doc.data(); const li = document.createElement('li'); li.textContent = ${d.donorName || 'Anonymous'} — ${formatNaira(d.amount)}${d.projectId ? ' (project)' : ''}; ul.appendChild(li); }); }catch(err){ console.error('Failed to update leaderboard', err); } }

// UI: Update project list progress bars (reads projects collection or uses static items as fallback) async function updateProjectListUI(){ try{ const db = firebase.firestore(); const container = document.getElementById('projectList'); if(!container) return;

// Try to fetch project docs from Firestore
const snapshot = await db.collection(PROJECTS_COLLECTION).get();
if(snapshot.empty){
  // no projects in DB — keep static HTML or show message
  return;
}
container.innerHTML = '';
snapshot.forEach(doc=>{
  const p = doc.data();
  const goal = Number(p.goal || 0);
  const raised = Number(p.raised || 0);
  const pct = goal > 0 ? Math.min(100, Math.round((raised/goal)*100)) : 0;

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h3>${p.title || 'Untitled Project'}</h3>
    <p>Goal: ${formatNaira(goal)}</p>
    <div class="progress-bar"><div class="progress" style="width:${pct}%"></div></div>
    <p>Raised: ${formatNaira(raised)}</p>
    <button onclick="donateToProject('${doc.id}')">Contribute</button>
  `;
  container.appendChild(card);
});

}catch(err){ console.error('Failed to load projects', err); } }

// Expose global functions for inline onclick handlers window.donate = donate; window.donateToProject = donateToProject;

/* IMPORTANT:

This implementation records donation intents optimistically in Firestore BEFORE the user completes payment on Flutterwave. For production, you should verify payment confirmations via a server-side webhook (Flutterwave sends webhooks) and update Firestore only after verifying the transaction.

Consider implementing a Firebase Function that handles Flutterwave webhook verification and then writes a confirmed donation record to the donations collection. The optimistic record above can be changed to a temporary 'pending' status and later updated to 'confirmed'. */
