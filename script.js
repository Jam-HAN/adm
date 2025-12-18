// ==========================================
// script.js (V37.3 - Final Bug Fix)
// ==========================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbw1k159kDezV8JwcImu7GM4q-bTTcUrPv6CwIYC_q47mpT5GlIGRy7OC4BduwL1vG5G/exec";

let currentUser = "";
let inPendingList = [];
let globalVendorList = [];
let globalModelList = [];
let globalAddonList = []; 
let currentOpenType = "";
let logoutTimer;
let tempOpenStockData = null;

// 1. 구글 로그인 핸들러
window.handleCredentialResponse = function(response) {
    if (!response.credential) {
        alert("구글 인증 정보를 받아오지 못했습니다.");
        return;
    }
    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action: "login", token: response.credential })
    })
    .then(res => res.json())
    .then(d => {
        if (d.status === 'success') {
            sessionStorage.setItem('dbphone_user', JSON.stringify({ name: d.name, email: d.user }));
            currentUser = d.name;
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('main-view').style.display = 'block';
            document.getElementById('user-name').innerText = currentUser;
            loadInitData();
            setupAutoLogout();
            loadDashboard();
        } else {
            alert("로그인 실패: " + d.message);
            document.getElementById('login-msg').innerText = d.message;
        }
    })
    .catch(error => {
        alert("서버 통신 오류. URL을 확인해주세요.");
    });
};

// 2. 페이지 로드
window.onload = function() {
    const saved = sessionStorage.getItem('dbphone_user');
    if(saved) {
        const u = JSON.parse(saved);
        currentUser = u.name;
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('main-view').style.display = 'block';
        document.getElementById('user-name').innerText = currentUser;
        loadInitData();
        setupAutoLogout();
        loadDashboard();
    }
    document.querySelectorAll('.enter-trigger').forEach(input => {
        input.addEventListener('keydown', function(e) { if(e.key === 'Enter') addVendor(); });
    });
};

function setupAutoLogout() {
    resetLogoutTimer();
    ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => document.addEventListener(evt, resetLogoutTimer));
}
function resetLogoutTimer() {
    clearTimeout(logoutTimer);
    if(currentUser) {
        logoutTimer = setTimeout(() => { alert("10분 동안 활동이 없어 자동 로그아웃 되었습니다."); logout(); }, 600000);
    }
}

function showSection(id) {
    document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active-section', 'fade-in'));
    document.getElementById(id).classList.add('active-section', 'fade-in');
    if(id === 'section-in') loadInitData();
    if(id === 'section-vendor') loadVendorsToList();
    if(id === 'section-stock') updateSearchUI();
    const input = document.querySelector(`#${id} input`);
    if(input) input.focus();
}

function showOpenSection(type) {
    currentOpenType = type;
    document.getElementById('open_title').innerText = type + " 처리";
    resetOpenForm();
    loadDropdownData(); 
    showSection('section-open');
}

function showWiredSection() {
    resetWiredForm();
    loadDropdownData(); 
    showSection('section-wired');
}

function showUsedSection() {
    resetUsedForm();
    loadDropdownData(); 
    showSection('section-used');
}

// --- 대시보드 ---
function loadDashboard() {
    const dashList = document.getElementById('dash_today_list');
    const dashUser = document.getElementById('dash_user_rank');
    if(!dashList || !dashUser) return;

    dashList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary"></div> 로딩 중...</td></tr>';
    dashUser.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-success"></div></div>';

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_dashboard_data" }) })
    .then(r => r.json())
    .then(d => {
        if(d.status === 'success') { renderDashboard(d.data); } 
        else { dashList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">로드 실패</td></tr>'; }
    })
    .catch(() => {
         dashList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">데이터 없음</td></tr>';
         dashUser.innerHTML = '<div class="text-center text-muted">데이터 없음</div>';
    });
}

function renderDashboard(data) {
    document.getElementById('dash_today_mobile').innerText = data.today.mobile;
    document.getElementById('dash_today_wired').innerText = data.today.wired;
    
    const monthDiv = document.getElementById('dash_month_stats');
    monthDiv.innerHTML = "";
    let branches = Object.keys(data.month);
    if(branches.length === 0) { monthDiv.innerHTML = "<div class='text-muted small'>데이터 없음</div>"; } 
    else {
        branches.forEach(b => {
            const m = data.month[b].mobile;
            const w = data.month[b].wired;
            monthDiv.innerHTML += `<div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom"><span class="fw-bold small">${b}</span><div class="text-end"><span class="badge bg-primary me-1">📱 ${m}</span><span class="badge bg-success">📺 ${w}</span></div></div>`;
        });
    }
    
    const listBody = document.getElementById('dash_today_list');
    listBody.innerHTML = "";
    if (data.todayList.length === 0) { listBody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">오늘 개통 내역이 없습니다.</td></tr>'; } 
    else {
        data.todayList.forEach(item => {
            const marginStr = Math.floor(Number(item.margin)).toLocaleString();
            const badgeClass = item.isWired ? "bg-success" : "bg-primary";
            listBody.innerHTML += `<tr><td><span class="badge bg-secondary">${item.branch}</span></td><td><span class="badge ${badgeClass} text-white">${item.type}</span></td><td class="fw-bold text-truncate-cell">${item.name}</td><td class="text-truncate-cell text-muted small">${item.user}</td><td class="text-end text-danger fw-bold">${marginStr}</td></tr>`;
        });
    }
    
    const rankBody = document.getElementById('dash_user_rank');
    rankBody.innerHTML = "";
    if (data.userRank.length === 0) { rankBody.innerHTML = '<div class="text-center text-muted">이달의 실적이 없습니다.</div>'; } 
    else {
        const max = data.userRank[0].count;
        data.userRank.forEach(u => {
            const percent = (u.count / max) * 100;
            rankBody.innerHTML += `<div class="user-rank-item"><span class="user-rank-name">${u.name}</span><div class="progress"><div class="progress-bar bg-success" style="width: ${percent}%"></div></div><span class="user-rank-count">${u.count}건</span></div>`;
        });
    }
}

function loadInitData() {
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_vendors" }) }).then(r => r.json()).then(d => {
        globalVendorList = d.list.map(v => v.name);
        const sel = document.getElementById('in_supplier'); sel.innerHTML = "";
        globalVendorList.forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); });
        if(document.getElementById('search_criteria').value === 'supplier') updateSearchUI();
    });
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_models" }) }).then(r => r.json()).then(d => globalModelList = d.list);
}

function loadDropdownData() {
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_dropdown_data" }) })
    .then(r => r.json())
    .then(d => {
        if(d.status !== 'success') return;
        const fill = (id, list) => {
            const sel = document.getElementById(id);
            if(sel) { sel.innerHTML = '<option value="" selected>선택</option>'; list.forEach(item => { sel.innerHTML += `<option value="${item}">${item}</option>`; }); }
        };
        fill('f_act_type', d.actListMobile); fill('f_cont_type', d.contListMobile); fill('f_review', d.reviewList); fill('f_usim', d.usimList);
        fill('w_pre_act_type', d.actListWired); fill('w_pre_cont_type', d.contListWired); fill('w_review', d.reviewList);
        fill('u_pre_act_type', d.actListUsed); fill('u_pre_cont_type', d.contListUsed); fill('u_review', d.reviewList); fill('u_usim', d.usimList);
        if(d.wiredVendorList) { fill('w_pre_avalue', d.wiredVendorList); fill('u_pre_avalue', d.wiredVendorList); }
        
        const vList = d.visitList || []; const vOpts = '<option value="" selected>선택</option>' + vList.map(i=>`<option value="${i}">${i}</option>`).join('') + '<option value="기타">기타 (직접입력)</option>';
        if(document.getElementById('f_visit')) document.getElementById('f_visit').innerHTML = vOpts;
        if(document.getElementById('w_visit')) document.getElementById('w_visit').innerHTML = vOpts;
        if(document.getElementById('u_visit')) document.getElementById('u_visit').innerHTML = vOpts;
        
        const pList = d.payMethodList || []; const cList = d.colMethodList || [];
        ['f_pay1_m','f_pay2_m', 'w_pay1_m','w_pay2_m', 'u_pay1_m','u_pay2_m'].forEach(id => fill(id, pList));
        ['f_inc4_m','f_inc4_2_m','f_inc5_m', 'w_inc5_m', 'u_inc5_m'].forEach(id => fill(id, cList));
        globalAddonList = d.addonList || [];
    });
}

function checkVisitPath() { const val = document.getElementById('f_visit').value; document.getElementById('div_visit_etc').style.display = (val === '기타') ? 'block' : 'none'; }
function checkWiredVisitPath() { const val = document.getElementById('w_visit').value; document.getElementById('w_div_visit_etc').style.display = (val === '기타') ? 'block' : 'none'; }
function checkUsedVisitPath() { const val = document.getElementById('u_visit').value; document.getElementById('u_div_visit_etc').style.display = (val === '기타') ? 'block' : 'none'; }

function renderAddonCheckboxes(agencyName, containerId = 'div_addon_container') {
    const container = document.getElementById(containerId);
    if(!container) return;
    container.innerHTML = "";
    const filtered = globalAddonList.filter(item => item.vendor === agencyName);
    if(filtered.length === 0) { container.innerHTML = `<span class='text-muted small'>[${agencyName}] 부가서비스 없음</span>`; return; }
    filtered.forEach(item => {
        const div = document.createElement('div');
        div.className = "form-check form-check-inline";
        div.innerHTML = `<input class="form-check-input addon-check" type="checkbox" id="${containerId}_${item.name}" value="${item.name}"><label class="form-check-label small" for="${containerId}_${item.name}">${item.name}</label>`;
        container.appendChild(div);
    });
}
function refreshAddons() { renderAddonCheckboxes(document.getElementById('f_avalue').value, 'div_addon_container'); }
function refreshWiredAddons() { renderAddonCheckboxes(document.getElementById('w_avalue').value, 'w_div_addon_container'); }
function refreshUsedAddons() { renderAddonCheckboxes(document.getElementById('u_avalue').value, 'u_div_addon_container'); }
function validateField(id, name) { const el = document.getElementById(id); if (!el.value) { alert(name + "을(를) 입력/선택해주세요."); el.focus(); return false; } return true; }

// --- 유선 개통 ---
function startWiredActivation() {
    const branch = document.getElementById('wired_branch').value; const vendor = document.getElementById('w_pre_avalue').value; const type = document.getElementById('w_pre_act_type').value; const contract = document.getElementById('w_pre_cont_type').value;
    if(!branch || !vendor || !type || !contract) return alert("모든 항목을 선택해주세요.");
    document.getElementById('wired_step_1').style.display = 'none'; document.getElementById('wired_step_2').style.display = 'block';
    document.getElementById('w_avalue').value = vendor; document.getElementById('w_act_type').value = type; document.getElementById('w_cont_type').value = contract;
    document.getElementById('w_target_info').innerText = `${type} : ${contract}`; document.getElementById('w_target_branch').innerText = branch;
    renderWiredPlanInputs(contract);
}
function renderWiredPlanInputs(contractType) {
    const area = document.getElementById('w_plan_input_area');
    area.innerHTML = "";
    if(contractType === "인터넷+TV+기타서비스") { area.innerHTML = `<div class="row g-2"><div class="col-4"><label class="form-label-sm">인터넷요금제</label><input type="text" class="form-control form-control-sm" id="w_plan_net"></div><div class="col-4"><label class="form-label-sm">TV요금제</label><input type="text" class="form-control form-control-sm" id="w_plan_tv"></div><div class="col-4"><label class="form-label-sm">기타서비스</label><input type="text" class="form-control form-control-sm" id="w_plan_other"></div></div>`; } 
    else if(contractType === "인터넷+TV") { area.innerHTML = `<div class="row g-2"><div class="col-6"><label class="form-label-sm">인터넷요금제</label><input type="text" class="form-control form-control-sm" id="w_plan_net"></div><div class="col-6"><label class="form-label-sm">TV요금제</label><input type="text" class="form-control form-control-sm" id="w_plan_tv"></div></div>`; } 
    else { area.innerHTML = `<div class="row g-2"><div class="col-12"><label class="form-label-sm">인터넷요금제</label><input type="text" class="form-control form-control-sm" id="w_plan_net"></div></div>`; }
}
function resetWiredForm() {
    document.getElementById('wired_branch').selectedIndex = 0; document.getElementById('w_pre_avalue').selectedIndex = 0; document.getElementById('w_pre_act_type').selectedIndex = 0; document.getElementById('w_pre_cont_type').selectedIndex = 0;
    document.getElementById('wired_step_1').style.display = 'block'; document.getElementById('wired_step_2').style.display = 'none';
    document.querySelectorAll('#wired_step_2 input').forEach(i => i.value = ""); document.querySelectorAll('#wired_step_2 select').forEach(s => s.selectedIndex=0);
    document.getElementById('w_div_visit_etc').style.display = 'none';
    setTimeout(() => { const firstInput = document.querySelector('#wired_step_1 select'); if(firstInput) firstInput.focus(); }, 100);
}
function submitWiredContract(event) {
    if (!validateField('w_visit', '방문경로')) return; if (!validateField('w_name', '고객명')) return; if (!validateField('w_review', '리뷰작성여부')) return;
    let visitVal = document.getElementById('w_visit').value; if(visitVal === '기타') { if(!validateField('w_visit_etc', '상세 방문경로')) return; visitVal = "기타: " + document.getElementById('w_visit_etc').value; }
    const parts = []; ['w_plan_net','w_plan_tv','w_plan_other'].forEach(id => { const el=document.getElementById(id); if(el && el.value) parts.push(el.value); });
    const pricePlan = parts.join(" / ");
    const formData = {
        action: "open_wired_full", user: currentUser, branch: document.getElementById('wired_branch').value, activationType: document.getElementById('w_act_type').value, contractType: document.getElementById('w_cont_type').value, name: document.getElementById('w_name').value, birth: document.getElementById('w_birth').value, visitPath: visitVal, phoneNumber: document.getElementById('w_phone').value, pricePlan: pricePlan, card: document.getElementById('w_card').value, review: document.getElementById('w_review').value, aValue: document.getElementById('w_avalue').value, policy: document.getElementById('w_policy').value,
        income1: document.getElementById('w_inc1').value, income1Memo: document.getElementById('w_inc1_m').value, income2: document.getElementById('w_inc2').value, income2Memo: document.getElementById('w_inc2_m').value, income3: document.getElementById('w_inc3').value, income3Memo: document.getElementById('w_inc3_m').value, cost1: document.getElementById('w_cost1').value, cost1Memo: document.getElementById('w_cost1_m').value, cost2: document.getElementById('w_cost2').value,
        payment1: document.getElementById('w_pay1').value, payment1Method: document.getElementById('w_pay1_m').value, payment1Date: document.getElementById('w_pay1_d').value, payment2: document.getElementById('w_pay2').value, payment2Method: document.getElementById('w_pay2_m').value, payment2Date: document.getElementById('w_pay2_d').value, cash: document.getElementById('w_cash').value, payback1: document.getElementById('w_back').value, bankName: document.getElementById('w_bank').value, accountNumber: document.getElementById('w_acc').value, depositor: document.getElementById('w_holder').value,
        income5: document.getElementById('w_inc5').value, income5Method: document.getElementById('w_inc5_m').value, income6: document.getElementById('w_inc6').value, income6Memo: document.getElementById('w_inc6_m').value, comment: document.getElementById('w_comment').value
    };
    const btn = event.currentTarget; const originalText = btn.innerHTML; btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 저장 중...`; btn.disabled = true;
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(formData) }).then(r => r.json()).then(d => { if(d.status === 'success') { alert(d.message); resetWiredForm(); } else { alert("오류: " + d.message); } }).catch(e => alert("통신 오류")).finally(() => { btn.innerHTML = originalText; btn.disabled = false; });
}

function startUsedActivation() {
    const branch = document.getElementById('u_branch').value; const vendor = document.getElementById('u_pre_avalue').value; const type = document.getElementById('u_pre_act_type').value; const contract = document.getElementById('u_pre_cont_type').value;
    if(!branch || !vendor || !type || !contract) return alert("모든 항목을 선택해주세요.");
    document.getElementById('used_step_1').style.display = 'none'; document.getElementById('used_step_2').style.display = 'block';
    document.getElementById('u_avalue').value = vendor; document.getElementById('u_act_type').value = type; document.getElementById('u_cont_type').value = contract;
    document.getElementById('u_target_info').innerText = `${type} : ${contract}`; document.getElementById('u_target_branch').innerText = branch;
    refreshUsedAddons();
}
function resetUsedForm() {
    document.getElementById('u_branch').selectedIndex = 0; document.getElementById('u_pre_avalue').selectedIndex = 0; document.getElementById('u_pre_act_type').selectedIndex = 0; document.getElementById('u_pre_cont_type').selectedIndex = 0;
    document.getElementById('used_step_1').style.display = 'block'; document.getElementById('used_step_2').style.display = 'none';
    document.querySelectorAll('#used_step_2 input').forEach(i => i.value = ""); document.querySelectorAll('#used_step_2 select').forEach(s => s.selectedIndex=0);
    document.getElementById('u_div_visit_etc').style.display = 'none'; document.getElementById('u_div_addon_container').innerHTML = "";
    setTimeout(() => { const firstInput = document.querySelector('#used_step_1 select'); if(firstInput) firstInput.focus(); }, 100);
}
function submitUsedContract(event) {
    if (!validateField('u_visit', '방문경로')) return; if (!validateField('u_name', '고객명')) return; if (!validateField('u_review', '리뷰작성여부')) return;
    let visitVal = document.getElementById('u_visit').value; if(visitVal === '기타') { if(!validateField('u_visit_etc', '상세 방문경로')) return; visitVal = "기타: " + document.getElementById('u_visit_etc').value; }
    const selectedAddons = []; document.querySelectorAll('#u_div_addon_container .addon-check:checked').forEach(cb => selectedAddons.push(cb.value));
    const formData = {
        action: "open_used_full", user: currentUser, branch: document.getElementById('u_branch').value, activationType: document.getElementById('u_act_type').value, contractType: document.getElementById('u_cont_type').value, name: document.getElementById('u_name').value, birth: document.getElementById('u_birth').value, visitPath: visitVal, phoneNumber: document.getElementById('u_phone').value, pricePlan: document.getElementById('u_plan').value, changePlan: document.getElementById('u_plan_chg').value, selectedAddons: selectedAddons, usim: document.getElementById('u_usim').value, card: document.getElementById('u_card').value, review: document.getElementById('u_review').value, aValue: document.getElementById('u_avalue').value, policy: document.getElementById('u_policy').value, model: document.getElementById('u_model').value, serial: document.getElementById('u_serial').value,
        income1: document.getElementById('u_inc1').value, income1Memo: document.getElementById('u_inc1_m').value, income2: document.getElementById('u_inc2').value, income2Memo: document.getElementById('u_inc2_m').value, income3: document.getElementById('u_inc3').value, income3Memo: document.getElementById('u_inc3_m').value, cost1: document.getElementById('u_cost1').value, cost1Memo: document.getElementById('u_cost1_m').value, cost2: "", 
        payment1: document.getElementById('u_pay1').value, payment1Method: document.getElementById('u_pay1_m').value, payment1Date: document.getElementById('u_pay1_d').value, payment2: document.getElementById('u_pay2').value, payment2Method: document.getElementById('u_pay2_m').value, payment2Date: document.getElementById('u_pay2_d').value, cash: "", payback1: "", bankName: "", accountNumber: "", depositor: "", income4_1: "", income4_2: "",
        income5: document.getElementById('u_inc5').value, income5Method: document.getElementById('u_inc5_m').value, income6: document.getElementById('u_inc6').value, income6Memo: document.getElementById('u_inc6_m').value, comment: document.getElementById('u_comment').value
    };
    const btn = event.currentTarget; const originalText = btn.innerHTML; btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 저장 중...`; btn.disabled = true;
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(formData) }).then(r => r.json()).then(d => { if(d.status === 'success') { alert(d.message); resetUsedForm(); } else { alert("오류: " + d.message); } }).catch(e => alert("통신 오류")).finally(() => { btn.innerHTML = originalText; btn.disabled = false; });
}

// ★ [수정] 무선 개통 스캔 & 저장 (연결 강화)
function handleOpenScan(e) { 
    if(e.key!=='Enter') return; 
    const v=e.target.value.trim(); 
    e.target.disabled = true;
    document.getElementById('open_spinner').style.display = 'block';
    fetch(GAS_URL,{method:"POST",body:JSON.stringify({ action:"get_stock_info_for_open", input:v })})
    .then(r=>r.json()).then(d=>{
        if(d.status==='success') {
            tempOpenStockData = d.data; 
            tempOpenStockData.inputCode = v; 
            document.getElementById('target_model').innerText = `${d.data.model} (${d.data.color})`; 
            document.getElementById('target_serial').innerText = d.data.serial;
            document.getElementById('target_branch').innerText = d.data.branch || "지점미상"; 
            document.getElementById('f_avalue').value = d.data.supplier || ""; 
            refreshAddons(); 
            document.getElementById('open_step_1').style.display = 'none';
            document.getElementById('open_step_2').style.display = 'block';
            document.getElementById('f_name').focus();
        } else {
            alert(d.message);
            e.target.disabled=false; e.target.value=""; e.target.focus();
        }
    })
    .catch(err => { alert("통신 오류 발생"); e.target.disabled=false; })
    .finally(() => { document.getElementById('open_spinner').style.display = 'none'; });
}

// ⚠️ window에 등록하여 HTML에서 무조건 찾을 수 있게 함
window.submitFullContract = function() {
    // 0. 버튼 상태 변경 (event 없이 ID로 제어)
    const btn = document.getElementById('btn-mobile-save');
    const originalText = '<i class="bi bi-save-fill"></i> 개통 및 저장 완료';
    
    // 1. 재고 스캔 확인
    if(!tempOpenStockData) {
        alert("단말기를 먼저 스캔해야 합니다 (Step 1).");
        return;
    }
    
    // 2. 유효성 검사
    if (!validateField('f_visit', '방문경로')) return;
    if (!validateField('f_name', '고객명')) return;
    if (!validateField('f_review', '리뷰작성여부')) return;
    
    let visitVal = document.getElementById('f_visit').value;
    if(visitVal === '기타') {
        if(!validateField('f_visit_etc', '상세 방문경로')) return;
        visitVal = "기타: " + document.getElementById('f_visit_etc').value;
    }

    // 저장 시작 알림 (테스트용) - 작동 확인 후 삭제 가능
    // alert("저장을 시작합니다...");

    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 저장 중...`;
    btn.disabled = true;

    const selectedAddons = [];
    document.querySelectorAll('#div_addon_container .addon-check:checked').forEach(cb => selectedAddons.push(cb.value));

    const formData = {
        action: "open_stock_full",
        stockInput: tempOpenStockData.inputCode,
        user: currentUser,
        activationType: document.getElementById('f_act_type').value,
        contractType: document.getElementById('f_cont_type').value,
        name: document.getElementById('f_name').value,
        birth: document.getElementById('f_birth').value,
        visitPath: visitVal,
        phoneNumber: document.getElementById('f_phone').value,
        pricePlan: document.getElementById('f_plan').value,
        changePlan: document.getElementById('f_plan_chg').value,
        selectedAddons: selectedAddons, 
        usim: document.getElementById('f_usim').value,
        card: document.getElementById('f_card').value,
        review: document.getElementById('f_review').value,
        aValue: document.getElementById('f_avalue').value,
        policy: document.getElementById('f_policy').value,
        income1: document.getElementById('f_inc1').value,
        income1Memo: document.getElementById('f_inc1_m').value,
        income2: document.getElementById('f_inc2').value,
        income2Memo: document.getElementById('f_inc2_m').value,
        income3: document.getElementById('f_inc3').value,
        income3Memo: document.getElementById('f_inc3_m').value,
        cost1: document.getElementById('f_cost1').value,
        cost1Memo: document.getElementById('f_cost1_m').value,
        cost2: document.getElementById('f_cost2').value,
        payment1: document.getElementById('f_pay1').value,
        payment1Method: document.getElementById('f_pay1_m').value,
        payment1Date: document.getElementById('f_pay1_d').value,
        payment2: document.getElementById('f_pay2').value,
        payment2Method: document.getElementById('f_pay2_m').value,
        payment2Date: document.getElementById('f_pay2_d').value,
        cash: document.getElementById('f_cash').value,
        payback1: document.getElementById('f_back').value,
        bankName: document.getElementById('f_bank').value,
        accountNumber: document.getElementById('f_acc').value,
        depositor: document.getElementById('f_holder').value,
        income4_1: document.getElementById('f_inc4').value,
        income4_1Method: document.getElementById('f_inc4_m').value,
        income4_2: document.getElementById('f_inc4_2').value,
        income4_2Method: document.getElementById('f_inc4_2_m').value,
        income5: document.getElementById('f_inc5').value,
        income5Method: document.getElementById('f_inc5_m').value,
        income6: document.getElementById('f_inc6').value,
        income6Memo: document.getElementById('f_inc6_m').value,
        comment: document.getElementById('f_comment').value
    };

    fetch(GAS_URL, { method: "POST", body: JSON.stringify(formData) })
    .then(r => r.json())
    .then(d => {
        if(d.status === 'success') { 
            alert(d.message); 
            resetOpenForm(); 
        } else { 
            alert("오류: " + d.message); 
        }
    })
    .catch(e => alert("통신 오류"))
    .finally(() => { 
        btn.innerHTML = originalText; 
        btn.disabled = false; 
    });
};

function resetOpenForm() {
    document.getElementById('open_step_1').style.display = 'block';
    document.getElementById('open_step_2').style.display = 'none';
    document.getElementById('open_scan').value = "";
    document.getElementById('open_scan').disabled = false;
    document.getElementById('open_spinner').style.display = 'none';
    document.getElementById('open_scan').focus();
    document.querySelectorAll('#open_step_2 input').forEach(i => i.value = "");
    document.querySelectorAll('#open_step_2 select').forEach(s => s.selectedIndex=0);
    document.getElementById('div_visit_etc').style.display='none';
    document.getElementById('div_addon_container').innerHTML = "<span class='text-muted small'>...</span>";
    tempOpenStockData = null;
}

// --- 기타 기능 ---
function updateSearchUI() {
    const criteria = document.getElementById('search_criteria').value;
    const area = document.getElementById('search_input_area');
    area.innerHTML = "";
    if(criteria === 'supplier') {
        const sel = document.createElement('select'); sel.className = "form-select"; sel.id = "search_value";
        globalVendorList.forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); });
        area.appendChild(sel);
    } else if(criteria === 'branch') {
        const sel = document.createElement('select'); sel.className = "form-select"; sel.id = "search_value";
        ["장지 본점", "명일 직영점"].forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); });
        area.appendChild(sel);
    } else if(criteria === 'model') {
        const sel = document.createElement('select'); sel.className = "form-select"; sel.id = "search_value";
        globalModelList.forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); });
        area.appendChild(sel);
    } else {
        const inp = document.createElement('input'); inp.className = "form-control"; inp.id = "search_value"; inp.placeholder = "입력하세요";
        inp.onkeydown = function(e){ if(e.key==='Enter') searchStock(); };
        area.appendChild(inp); inp.focus();
    }
}
function searchStock() {
    const crit = document.getElementById('search_criteria').value;
    const val = document.getElementById('search_value').value;
    const div = document.getElementById('stock_result');
    div.innerHTML = `<div class="text-center py-4"><span class="spinner-border text-primary"></span></div>`;
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "search_stock", criteria: crit, keyword: val }) })
    .then(r => r.json()).then(d => {
        if(!d.list || d.list.length === 0) { div.innerHTML = `<div class="text-center text-muted py-5">결과 없음</div>`; return; }
        let html = `<div class="table-responsive"><table class="table table-hover stock-table"><thead><tr><th>입고일</th><th>모델</th><th>색상</th><th>일련번호</th><th>상태</th><th>위치</th></tr></thead><tbody>`;
        d.list.forEach(item => {
            let st = item.status === '보유' ? 'text-success' : 'text-danger';
            html += `<tr><td>${item.date}</td><td class="fw-bold">${item.model}</td><td>${item.color}</td><td class="font-monospace">${item.serial}</td><td class="${st} fw-bold">${item.status}</td><td>${item.branch}</td></tr>`;
        });
        html += `</tbody></table></div><div class="text-end small text-muted">총 ${d.list.length}건</div>`;
        div.innerHTML = html;
    });
}
function searchHistory() { const k=document.getElementById('hist_keyword').value; fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"search_history",keyword:k})}).then(r=>r.json()).then(d=>{ let h=""; d.list.forEach(i=>h+=`<div class='glass-card p-2 mb-2'><span class='badge bg-secondary'>${i.type}</span> ${i.model} (${i.time})</div>`); document.getElementById('hist_result').innerHTML=h; }); }
function handleInScan(e) { if(e.key!=='Enter')return; const v=e.target.value.trim(); if(inPendingList.some(i=>i.barcode===v)){showMsg('in-msg','error','이미 목록에 있음');e.target.value="";return;} fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:document.getElementById('in_mode_toggle').checked?"scan_preview":"register_single",barcode:v,supplier:document.getElementById('in_supplier').value,branch:document.getElementById('in_branch').value,user:currentUser})}).then(r=>r.json()).then(d=>{if(d.status==='success'){if(document.getElementById('in_mode_toggle').checked){inPendingList.push({...d.data,supplier:document.getElementById('in_supplier').value});renderInList();showMsg('in-msg','success',`추가: ${d.data.model}`);}else showMsg('in-msg','success',`입고: ${d.data.model}`);}else showMsg('in-msg','error',d.message);}).finally(()=>{e.target.value="";e.target.focus();}); }
function renderInList() { const t=document.getElementById('in_tbody'); t.innerHTML=""; inPendingList.forEach((i,x)=>t.innerHTML+=`<tr><td>${i.model}</td><td>${i.serial}</td><td><button onclick="inPendingList.splice(${x},1);renderInList()">X</button></td></tr>`); document.getElementById('in_count').innerText=inPendingList.length; }
function clearInList() { inPendingList=[]; renderInList(); }
function submitInBatch() { if(!inPendingList.length)return; if(!confirm("입고?"))return; fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"batch_register",items:inPendingList,branch:document.getElementById('in_branch').value,user:currentUser})}).then(r=>r.json()).then(d=>{if(d.status==='success'){alert(d.count+"대 입고완료");clearInList();}else alert(d.message);}); }
function handleMoveScan(e) { if(e.key!=='Enter')return; const v=e.target.value.trim(); fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"transfer_stock",input:v,toBranch:document.getElementById('move_to_branch').value,user:currentUser})}).then(r=>r.json()).then(d=>showMsg('move-msg',d.status==='success'?'success':'error',d.message)).finally(()=>{e.target.value="";}); }
function handleOutScan(e) { if(e.key!=='Enter')return; const v=e.target.value.trim(); if(!document.getElementById('out_note').value){alert("사유필수");return;} fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"return_stock",input:v,note:document.getElementById('out_note').value,user:currentUser})}).then(r=>r.json()).then(d=>showMsg('out-msg',d.status==='success'?'success':'error',d.message)).finally(()=>{e.target.value="";}); }

// ★ [수정] 거래처 리스트 (상세 정보 표시)
function loadVendorsToList() { 
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_vendors" }) }).then(r => r.json()).then(d => { 
        const div = document.getElementById('vendor_list_ui'); 
        div.innerHTML = ""; 
        d.list.forEach(v => { 
            const sales = v.salesName ? `👤${v.salesName}` : '';
            const phone = v.salesPhone ? ` 📞${v.salesPhone}` : '';
            const office = v.officePhone ? ` 🏢${v.officePhone}` : '';
            
            div.innerHTML += `
                <div class="list-group-item p-3">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="fw-bold text-dark">${v.name}</span>
                        <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteVendor('${v.name}')" style="font-size:0.8rem;">삭제</button>
                    </div>
                    <div class="small text-muted text-truncate">
                        ${sales}${phone}${office}
                    </div>
                </div>`; 
        }); 
    }); 
}

function addVendor() { const n=document.getElementById('v_name').value; if(!n)return; fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"add_vendor",name:n,salesName:document.getElementById('v_sales').value,salesPhone:document.getElementById('v_phone').value,officePhone:document.getElementById('v_office').value})}).then(r=>r.json()).then(d=>{alert(d.message);loadVendorsToList();}); }
function deleteVendor(n) { if(confirm("삭제?")) fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"delete_vendor",name:n})}).then(r=>r.json()).then(d=>{alert(d.message);loadVendorsToList();}); }
function showMsg(id, type, text) { const el=document.getElementById(id); el.style.display='block'; el.className=`alert py-2 text-center small fw-bold rounded-3 alert-${type==='success'?'success':'danger'}`; el.innerText=text; setTimeout(()=>el.style.display='none',2000); }
function handleCredentialResponse(r) { fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"login",token:r.credential})}).then(res=>res.json()).then(d=>{ if(d.status==='success') { sessionStorage.setItem('dbphone_user',JSON.stringify({name:d.name,email:d.user})); currentUser=d.name; document.getElementById('login-view').style.display='none'; document.getElementById('main-view').style.display='block'; document.getElementById('user-name').innerText=currentUser; loadInitData(); setupAutoLogout(); } else document.getElementById('login-msg').innerText=d.message; }); }
function logout() { sessionStorage.removeItem('dbphone_user'); location.reload(); }
