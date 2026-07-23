// --- USER AUTHENTICATION & SUPABASE PROFILE MANAGEMENT ---
document.addEventListener('DOMContentLoaded', async () => {
  const savedFarmId = localStorage.getItem('sfl_farm_id');
  const savedApiKey = localStorage.getItem('sfl_api_key');

  if (savedFarmId) document.getElementById('farm-id').value = savedFarmId;
  if (savedApiKey) document.getElementById('api-key').value = savedApiKey;

  initAuth();
});

async function initAuth() {
  if (!supabaseClient) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    await setLoggedInUser(session.user);
  }

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      await setLoggedInUser(session.user);
    } else {
      setLoggedOutUser();
    }
  });
}

async function setLoggedInUser(user) {
  currentUser = user;
  document.getElementById('auth-logged-out').classList.add('hidden');
  document.getElementById('auth-logged-in').classList.remove('hidden');
  document.getElementById('user-email-display').textContent = user.email;

  const currentFarmId = document.getElementById('farm-id').value.trim();
  if (currentFarmId && supabaseClient) {
    await supabaseClient
      .from('profiles')
      .upsert({ id: user.id, farm_id: currentFarmId }, { onConflict: 'id' });
  }

  loadCloudUserData();
}

function setLoggedOutUser() {
  currentUser = null;
  document.getElementById('auth-logged-out').classList.remove('hidden');
  document.getElementById('auth-logged-in').classList.add('hidden');
  renderSnapshotHistory();
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();

  if (!supabaseClient) return alert("❌ Supabase client is not initialized.");
  if (!email || !password) return alert("⚠️ Please enter email and password.");

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  
  if (error) {
    alert("❌ Login Error: " + error.message);
  } else if (data.user) {
    alert("🎉 Logged in successfully!");
  }
});

document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const farmId = document.getElementById('farm-id').value.trim();

  if (!supabaseClient) return alert("❌ Supabase client is not initialized.");
  if (!email || !password) return alert("⚠️ Please enter email and password.");
  if (password.length < 6) return alert("⚠️ Password must be at least 6 characters.");
  if (!farmId) return alert("⚠️ Please enter your Farm ID below first!");

  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  
  if (error) {
    alert("❌ Sign Up Error: " + error.message);
  } else if (data.user) {
    const { error: profileErr } = await supabaseClient
      .from('profiles')
      .upsert({ id: data.user.id, farm_id: farmId }, { onConflict: 'id' });

    if (profileErr) {
      console.error("Profile link error:", profileErr.message);
    }

    alert("🎉 Account created & Farm ID linked successfully!");
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  if (supabaseClient) await supabaseClient.auth.signOut();
});

async function loadCloudUserData() {
  if (!currentUser || !supabaseClient) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDateStr = cutoff.toISOString().split('T')[0];

  const { data: profile } = await supabaseClient.from('profiles').select('farm_id').eq('id', currentUser.id).maybeSingle();
  if (profile && profile.farm_id) {
    document.getElementById('farm-id').value = profile.farm_id;
    localStorage.setItem('sfl_farm_id', profile.farm_id);
  }

  await supabaseClient.from('daily_yields').delete().eq('user_id', currentUser.id).lt('yield_date', cutoffDateStr);
  await supabaseClient.from('preharvest_baselines').delete().eq('user_id', currentUser.id).lt('snapshot_date', cutoffDateStr);

  const { data: yields } = await supabaseClient.from('daily_yields').select('*').eq('user_id', currentUser.id).order('yield_date', { ascending: false });
  if (yields && yields.length > 0) {
    let history = yields.map(y => ({
      date: y.yield_date,
      totalCount: parseFloat(y.total_count),
      netFlowers: y.net_flowers,
      crops: y.crops
    }));
    localStorage.setItem('sfl_daily_snapshots', JSON.stringify(history));
  } else {
    localStorage.setItem('sfl_daily_snapshots', JSON.stringify([]));
  }

  let localHistory = JSON.parse(localStorage.getItem('sfl_daily_snapshots') || '[]');
  let filteredLocal = localHistory.filter(item => item.date >= cutoffDateStr);
  localStorage.setItem('sfl_daily_snapshots', JSON.stringify(filteredLocal));

  renderSnapshotHistory();
  updatePreHarvestUI();
}

document.getElementById('farm-id').addEventListener('input', async (e) => {
  const farmId = e.target.value.trim();
  localStorage.setItem('sfl_farm_id', farmId);
  if (currentUser && supabaseClient && farmId) {
    await supabaseClient.from('profiles').upsert({ id: currentUser.id, farm_id: farmId }, { onConflict: 'id' });
  }
});

document.getElementById('api-key').addEventListener('input', (e) => localStorage.setItem('sfl_api_key', e.target.value));
