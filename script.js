// ==========================================
// script.js (V56.0 - Optimized UI Rendering)
// ==========================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbxUMhvQy7T9fESf_pYHfWpph8gxcXK-IZIOD7HBOBPj9can0c2jSKzX6l6He1zfNPKC/exec"; 

let currentUser = "";
let inPendingList = [];
let globalVendorList = [];
let globalModelList = [];
let globalAddonList = []; 
let globalIphoneData = {}; 
let globalDropdownData = null;
let currentOpenType = "";
let logoutTimer;
let tempOpenStockData = null;
let tempInStockData = null; 

// --- [3단계] UI 렌더링 최적화 헬퍼 ---
// HTML을 += 로 붙이지 않고 배열로 모아 한 번에 join하여 렌더링
function renderHtmlList(containerId, dataList, renderFunc, emptyMsg) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (!dataList || dataList.length === 0) {
        container.innerHTML = emptyMsg || '<div class="text-center text-muted py-3">데이터가 없습니다.</div>';
        return;
    }
    // map().join('') 방식이 innerHTML += 보다 훨씬 빠름
    container.innerHTML = dataList.map(renderFunc).join('');
}

// 1. 인증 및 초기화
window.handleCredentialResponse = function(response) {
    if (!response.credential) { alert("구글 인증 정보를 받아오지 못했습니다."); return; }
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "login", token: response.credential }) })
    .then(res => res.json())
    .then(d => {
        if (d.status === 'success') {
            sessionStorage.setItem('dbphone_user', JSON.stringify({ name: d.name, email: d.user }));
            currentUser = d.name;
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('main-view').style.display = 'block';
            document.getElementById('user-name').innerText = currentUser;
            loadInitData();
            loadDropdownData();
            setupAutoLogout();
            loadDashboard();
        } else {
            alert("로그인 실패: " + d.message);
            document.getElementById('login-msg').innerText = d.message;
        }
    })
    .catch(error => alert("서버 통신 오류. URL을 확인해주세요."));
};

// script.js (V56.1 Final) - window.onload 전체 교체

window.onload = function() {

    // 1. [UI] 브라우저 기본 alert를 예쁜 SweetAlert2로 교체 (Toast 방식)
    window.alert = function(msg) {
        Swal.fire({
            text: msg,
            icon: 'info',
            confirmButtonColor: '#4361ee',
            confirmButtonText: '확인'
        });
    };
    
    // 2. [UI] showMsg 함수도 Toast로 업그레이드
    window.showMsg = function(id, type, text) {
        const iconType = type === 'success' ? 'success' : 'error';
        const Toast = Swal.mixin({
            toast: true,
            position: 'top', // 상단 중앙
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
            didOpen: (toast) => {
                toast.addEventListener('mouseenter', Swal.stopTimer)
                toast.addEventListener('mouseleave', Swal.resumeTimer)
            }
        });
        
        Toast.fire({
            icon: iconType,
            title: text
        });
    };
    
    // 3. [로직] 세션 확인 및 데이터 로드
    const saved = sessionStorage.getItem('dbphone_user');
    if(saved) {
        const u = JSON.parse(saved);
        currentUser = u.name;
        document.getElementById('login-view').style.display = 'none';
        document.getElementById('main-view').style.display = 'block';
        document.getElementById('user-name').innerText = currentUser;
        
        loadInitData();
        loadDropdownData();
        setupAutoLogout();
        loadDashboard();
    }

    // 4. [로직] 엔터키 이벤트 연결 (거래처 등록 등)
    document.querySelectorAll('.enter-trigger').forEach(input => {
        input.addEventListener('keydown', function(e) { if(e.key === 'Enter') addVendor(); });
    });

    // 5. [로직] 모달 '입력 완료' 버튼 이벤트 연결 (안전한 방식)
    const stockSubmitBtn = document.getElementById('btn-stock-submit');
    if (stockSubmitBtn) {
        // 중복 방지를 위해 기존 요소를 복제하여 교체
        const newBtn = stockSubmitBtn.cloneNode(true);
        stockSubmitBtn.parentNode.replaceChild(newBtn, stockSubmitBtn);
        newBtn.addEventListener('click', submitStockRegister);
        console.log("버튼 이벤트 리스너 연결됨");
    }

    // 6. [UX] 모달이 닫힐 때 입력 필드 초기화 (★누락된 부분 추가됨★)
    const stockModalEl = document.getElementById('modal-stock-register');
    if (stockModalEl) {
        stockModalEl.addEventListener('hidden.bs.modal', function () {
            // 수동 입력 필드 초기화
            document.getElementById('reg_manual_model').value = "";
            document.getElementById('reg_manual_storage').value = "";
            document.getElementById('reg_manual_color').value = "";
            
            // 아이폰 입력 필드 초기화
            document.getElementById('reg_iphone_model').value = "";
            document.getElementById('reg_iphone_storage').innerHTML = '<option value="">선택</option>';
            document.getElementById('reg_iphone_color').innerHTML = '<option value="">선택</option>';
            
            // 간편입고용 거래처 필드 초기화
            const supEl = document.getElementById('reg_modal_supplier');
            if(supEl) supEl.value = "";
            
            console.log("모달 닫힘: 입력창 초기화 완료");
        });
    }
};

function logout() { sessionStorage.removeItem('dbphone_user'); location.reload(); }

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

// 2. 화면 전환
function showSection(id) {
    const nav = document.getElementById('navbarNav');
    if (nav && nav.classList.contains('show')) {
        const bsCollapse = bootstrap.Collapse.getInstance(nav) || new bootstrap.Collapse(nav, {toggle: false});
        bsCollapse.hide();
    }
    document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active-section', 'fade-in'));
    document.getElementById(id).classList.add('active-section', 'fade-in');
    
    if(id === 'section-in') {
        loadInitData();
        loadDropdownData();
    }
    if(id === 'section-vendor') loadVendorsToList();
    if(id === 'section-stock') updateSearchUI();
    const input = document.querySelector(`#${id} input`);
    if(input) input.focus();
}

function showOpenSection(type) {
    currentOpenType = type;
    document.getElementById('open_title').innerHTML = `<i class="bi bi-phone"></i> 무선 개통`;
    resetOpenForm();
    loadDropdownData(); 
    showSection('section-open');
}
function showWiredSection() { resetWiredForm(); loadDropdownData(); showSection('section-wired'); }
function showUsedSection() { resetUsedForm(); loadDropdownData(); showSection('section-used'); }

// 3. 대시보드 (렌더링 최적화 적용)
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
    
    // 월간 누적
    renderHtmlList('dash_month_stats', Object.keys(data.month), b => `
        <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
            <span class="fw-bold small">${b}</span>
            <div class="text-end">
                <span class="badge bg-primary me-1">📱 ${data.month[b].mobile}</span>
                <span class="badge bg-success">📺 ${data.month[b].wired}</span>
            </div>
        </div>
    `, '데이터 없음');
    
    // 오늘 리스트
    renderHtmlList('dash_today_list', data.todayList, item => {
        const marginStr = Math.floor(Number(item.margin)).toLocaleString();
        const colorClass = item.badgeColor ? `bg-${item.badgeColor}` : "bg-secondary";
        return `<tr>
            <td><span class="badge bg-secondary">${item.branch}</span></td>
            <td><span class="badge ${colorClass}">${item.type}</span></td>
            <td class="fw-bold">${item.name}님</td>
            <td class="text-muted small">${item.user}님</td>
            <td class="text-danger fw-bold">${marginStr}</td>
        </tr>`;
    }, '<tr><td colspan="5" class="text-center py-4 text-muted">오늘 개통 내역이 없습니다.</td></tr>');
    
    // 직원 랭킹
    if (!data.userRank || data.userRank.length === 0) {
        document.getElementById('dash_user_rank').innerHTML = '<div class="text-center text-muted">이달의 실적이 없습니다.</div>';
    } else {
        const max = data.userRank[0].total; 
        renderHtmlList('dash_user_rank', data.userRank, u => {
            const mobilePct = max > 0 ? (u.mobile / max) * 100 : 0;
            const wiredPct = max > 0 ? (u.wired / max) * 100 : 0;
            return `
            <div class="user-rank-item py-2 border-bottom">
                <div class="user-rank-name">${u.name}</div>
                <div class="flex-grow-1 mx-2">
                    <div class="d-flex align-items-center mb-1">
                        <div class="progress w-100" style="height: 6px; margin:0; background-color:#eaecf4;">
                            <div class="progress-bar bg-primary" style="width: ${mobilePct}%"></div>
                        </div>
                        <span class="ms-2 text-primary fw-bold" style="font-size:0.75rem; width:25px; text-align:right;">${u.mobile}</span>
                    </div>
                    <div class="d-flex align-items-center">
                        <div class="progress w-100" style="height: 6px; margin:0; background-color:#eaecf4;">
                            <div class="progress-bar bg-success" style="width: ${wiredPct}%"></div>
                        </div>
                        <span class="ms-2 text-success fw-bold" style="font-size:0.75rem; width:25px; text-align:right;">${u.wired}</span>
                    </div>
                </div>
                <div class="user-rank-count ms-1">${u.total}건</div>
            </div>`;
        });
    }
}

// [최종 수정] 초기 데이터 로드 (loadDropdownData와 일관성 유지: 캐싱 적용)
function loadInitData() {
    // 1. 거래처 데이터: 캐싱 확인
    if (globalVendorList && globalVendorList.length > 0) {
        renderVendorDropdown(); // 이미 있으면 바로 그림
        // 검색창이 '거래처'로 설정된 경우 검색창 옵션도 갱신
        if (document.getElementById('search_criteria').value === 'supplier') updateSearchUI();
    } else {
        // 없으면 서버 요청
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_vendors" }) })
        .then(r => r.json())
        .then(d => {
            globalVendorList = d.list.map(v => v.name);
            renderVendorDropdown();
            if (document.getElementById('search_criteria').value === 'supplier') updateSearchUI();
        });
    }

    // 2. 모델 데이터: 캐싱 확인
    if (globalModelList && globalModelList.length > 0) {
        // 모델 데이터는 현재 검색창(updateSearchUI)에서만 쓰임
        if (document.getElementById('search_criteria').value === 'model') updateSearchUI();
    } else {
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_models" }) })
        .then(r => r.json())
        .then(d => {
            globalModelList = d.list;
            // 로드 완료 후 검색창이 모델이면 갱신
            if (document.getElementById('search_criteria').value === 'model') updateSearchUI();
        });
    }

    // 3. 아이폰 데이터: 캐싱 확인
    if (Object.keys(globalIphoneData).length === 0) {
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_iphone_data" }) })
        .then(r => r.json())
        .then(d => {
            globalIphoneData = d.data;
        });
    }
}

function loadDropdownData() {
    if (globalDropdownData) { applyDropdownData(globalDropdownData); return; }
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_dropdown_data" }) }).then(r => r.json()).then(d => {
        if(d.status === 'success') { globalDropdownData = d; applyDropdownData(d); }
    });
}

function applyDropdownData(d) {
    const fill = (id, list) => { const sel = document.getElementById(id); if(sel) { sel.innerHTML = '<option value="" selected>선택하세요</option>' + list.map(i => `<option value="${i}">${i}</option>`).join(''); } };
    fill('f_act_type', d.actListMobile); fill('f_cont_type', d.contListMobile); fill('f_review', d.reviewList); fill('f_usim', d.usimList);
    fill('w_pre_act_type', d.actListWired); fill('w_pre_cont_type', d.contListWired); fill('w_review', d.reviewList);
    fill('u_pre_act_type', d.actListUsed); fill('u_pre_cont_type', d.contListUsed); fill('u_review', d.reviewList); fill('u_usim', d.usimList);
    if(d.wiredVendorList) { fill('w_pre_avalue', d.wiredVendorList); fill('u_pre_avalue', d.wiredVendorList); }
    const vOpts = '<option value="" selected>선택하세요</option>' + (d.visitList || []).map(i=>`<option value="${i}">${i}</option>`).join('') + '<option value="기타">기타 (직접입력)</option>';
    ['f_visit', 'w_visit', 'u_visit'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = vOpts; });
    const pList = d.payMethodList || []; const cList = d.colMethodList || [];
    ['f_pay1_m','f_pay2_m', 'w_pay1_m','w_pay2_m', 'u_pay1_m','u_pay2_m'].forEach(id => fill(id, pList));
    ['f_inc4_m','f_inc4_2_m','f_inc5_m', 'w_inc5_m', 'u_inc5_m'].forEach(id => fill(id, cList));
    globalAddonList = d.addonList || [];
}

// 5. 유틸리티
function checkVisitPath() { const val = document.getElementById('f_visit').value; document.getElementById('div_visit_etc').style.display = (val === '기타') ? 'block' : 'none'; }
function checkWiredVisitPath() { const val = document.getElementById('w_visit').value; document.getElementById('w_div_visit_etc').style.display = (val === '기타') ? 'block' : 'none'; }
function checkUsedVisitPath() { const val = document.getElementById('u_visit').value; document.getElementById('u_div_visit_etc').style.display = (val === '기타') ? 'block' : 'none'; }

function renderAddonCheckboxes(agencyName, containerId = 'div_addon_container') {
    const container = document.getElementById(containerId);
    if(!container) return;
    const filtered = globalAddonList.filter(item => item.vendor === agencyName);
    if(filtered.length === 0) { container.innerHTML = `<span class='text-muted small'>[${agencyName}] 부가서비스 없음</span>`; return; }
    renderHtmlList(containerId, filtered, item => `
        <div class="form-check form-check-inline">
            <input class="form-check-input addon-check" type="checkbox" id="${containerId}_${item.name}" value="${item.name}">
            <label class="form-check-label small" for="${containerId}_${item.name}">${item.name}</label>
        </div>
    `);
}
function refreshAddons() { renderAddonCheckboxes(document.getElementById('f_avalue').value, 'div_addon_container'); }
function refreshWiredAddons() { renderAddonCheckboxes(document.getElementById('w_avalue').value, 'w_div_addon_container'); }
function refreshUsedAddons() { renderAddonCheckboxes(document.getElementById('u_avalue').value, 'u_div_addon_container'); }
function validateField(id, name) { const el = document.getElementById(id); if (!el.value) { alert(name + "을(를) 입력/선택해주세요."); el.focus(); return false; } return true; }

// --- 재고 입고 로직 ---
function handleInScan(e) { 
    if(e.key !== 'Enter') return; 
    const v = e.target.value.trim(); 
    if(!v) return;
    if(inPendingList.some(i => i.barcode === v)) { showMsg('in-msg','error','이미 목록에 있음'); e.target.value=""; return; }
    e.target.value = ""; e.target.focus();

    const isContinuous = document.getElementById('in_mode_toggle').checked;
    const tempId = Date.now();
    const currentSupplier = document.getElementById('in_supplier').value;
    const currentBranch = document.getElementById('in_branch').value;

    if(isContinuous) {
        inPendingList.push({ tempId, model: "조회 중...", supplier: currentSupplier, branch: currentBranch, serial: v, color: "", isLoading: true });
        renderInList();
    }

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "scan_preview", barcode: v, supplier: currentSupplier, branch: currentBranch, user: currentUser }) })
    .then(r => r.json())
    .then(d => {
        if(isContinuous) {
            const idx = inPendingList.findIndex(i => i.tempId === tempId);
            if(idx === -1) return;
            if(d.status === 'success') {
                inPendingList[idx] = { ...d.data, supplier: currentSupplier, branch: currentBranch };
                renderInList(); 
            } else if (d.status === 'iphone' || d.status === 'unregistered') {
                inPendingList.splice(idx, 1); renderInList();
                showStockRegisterModal(d.status, d.data);
            } else {
                inPendingList.splice(idx, 1); renderInList();
                showMsg('in-msg','error', d.message);
            }
        } else {
            if(d.status === 'success') requestSingleRegister(v);
            else if(d.status === 'iphone' || d.status === 'unregistered') showStockRegisterModal(d.status, d.data);
            else showMsg('in-msg','error', d.message);
        }
    })
    .catch(() => { if(isContinuous) { const idx = inPendingList.findIndex(i => i.tempId === tempId); if(idx !== -1) inPendingList.splice(idx, 1); renderInList(); } alert("통신 오류"); }); 
}

function requestSingleRegister(barcode) {
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "register_single", barcode: barcode, supplier: document.getElementById('in_supplier').value, branch: document.getElementById('in_branch').value, user: currentUser }) })
    .then(r => r.json()).then(d => { if(d.status === 'success') showMsg('in-msg','success',`입고: ${d.data.model}`); else showMsg('in-msg','error', d.message); });
}

function showStockRegisterModal(type, dataObj) {
    const modal = new bootstrap.Modal(document.getElementById('modal-stock-register'));
    const title = document.getElementById('modal-register-title');
    const areaIphone = document.getElementById('area-iphone');
    const areaManual = document.getElementById('area-manual');
    const areaSupplier = document.getElementById('area-modal-supplier'); 
    const areaBarcode = document.getElementById('area-modal-barcode'); 
    const msgText = document.getElementById('msg-manual-text'); 
    
    document.getElementById('reg_modal_barcode').value = dataObj.barcode || "";
    document.getElementById('reg_modal_serial').value = dataObj.serial || "";
    let defaultSup = document.getElementById('in_supplier').value || "지점미상";
    let defaultBranch = document.getElementById('in_branch').value || "장지 본점";

    tempInStockData = { type, barcode: dataObj.barcode, serial: dataObj.serial, supplier: defaultSup, branch: defaultBranch };

    if (type === 'simple_open') {
        if (title) title.innerHTML = '<i class="bi bi-lightning-fill"></i> 간편 입고 (개통용)';
        if (areaBarcode) areaBarcode.style.display = 'none';
        if (areaSupplier) {
            areaSupplier.style.display = 'block'; 
            const modalSupSel = document.getElementById('reg_modal_supplier');
            if(modalSupSel) {
                modalSupSel.innerHTML = '<option value="">선택하세요</option>';
                if (globalVendorList.length > 0) globalVendorList.forEach(v => modalSupSel.innerHTML += `<option value="${v}">${v}</option>`);
                else modalSupSel.innerHTML += `<option value="" disabled>로딩 중...</option>`;
                modalSupSel.value = ""; 
            }
        }
        if (msgText) { msgText.style.display = 'block'; msgText.innerHTML = `<i class="bi bi-info-circle"></i> 재고에 없는 단말기입니다.<br>거래처와 정보를 입력하여 입고 후 개통합니다.`; msgText.className = "alert alert-primary small fw-bold mb-3"; }
        if (areaIphone) areaIphone.style.display = 'none';
        if (areaManual) areaManual.style.display = 'block';
        const manualStorage = document.getElementById('reg_manual_storage');
        manualStorage.innerHTML = '<option value="">선택하세요</option>';
        if (globalDropdownData && globalDropdownData.otherCapacityList) globalDropdownData.otherCapacityList.forEach(c => manualStorage.innerHTML += `<option value="${c}">${c}</option>`);
        document.getElementById('reg_manual_model').value = ""; manualStorage.value = ""; document.getElementById('reg_manual_color').value = "";
    } else {
        if (areaBarcode) areaBarcode.style.display = 'block'; 
        if (areaSupplier) areaSupplier.style.display = 'none'; 
        if (type === 'iphone') {
            if (title) title.innerHTML = '<i class="bi bi-apple"></i> 아이폰 정보 입력';
            if (msgText) msgText.style.display = 'none';
            if (areaIphone) areaIphone.style.display = 'block';
            if (areaManual) areaManual.style.display = 'none';
            const modelSel = document.getElementById('reg_iphone_model');
            modelSel.innerHTML = '<option value="">선택하세요</option>';
            Object.keys(globalIphoneData).forEach(m => modelSel.innerHTML += `<option value="${m}">${m}</option>`);
            document.getElementById('reg_iphone_storage').innerHTML = '<option value="">선택하세요</option>';
            document.getElementById('reg_iphone_color').innerHTML = '<option value="">선택하세요</option>';
        } else {
            if (title) title.innerHTML = '<i class="bi bi-question-circle"></i> 미등록 단말기 입력';
            if (msgText) { msgText.style.display = 'block'; msgText.innerHTML = `<i class="bi bi-exclamation-triangle"></i> 등록되지 않은 단말기입니다.<br>정보를 입력하면 다음 입고부터는 자동 등록됩니다.`; msgText.className = "alert alert-warning small fw-bold mb-3"; }
            if (areaIphone) areaIphone.style.display = 'none';
            if (areaManual) areaManual.style.display = 'block';
            const manualStorage = document.getElementById('reg_manual_storage');
            manualStorage.innerHTML = '<option value="">선택하세요</option>';
            if (globalDropdownData && globalDropdownData.otherCapacityList) globalDropdownData.otherCapacityList.forEach(c => manualStorage.innerHTML += `<option value="${c}">${c}</option>`);
            document.getElementById('reg_manual_model').value = ""; manualStorage.value = ""; document.getElementById('reg_manual_color').value = "";
            setTimeout(() => { const el = document.getElementById('reg_manual_model'); if(el) el.focus(); }, 300);
        }
    }
    modal.show();
}

function updateIphoneColors() {
    const model = document.getElementById('reg_iphone_model').value;
    const colorSel = document.getElementById('reg_iphone_color');
    const storageSel = document.getElementById('reg_iphone_storage');
    colorSel.innerHTML = '<option value="">선택하세요</option>'; storageSel.innerHTML = '<option value="">선택하세요</option>';
    if (!model) return;
    const data = globalIphoneData[model];
    if (data) {
        if (data.storage) data.storage.forEach(s => storageSel.innerHTML += `<option value="${s}">${s}</option>`);
        if (data.colors) data.colors.forEach(c => colorSel.innerHTML += `<option value="${c}">${c}</option>`);
    }
}

// [최종 수정] 입력 완료 버튼 로직 (포커스 해제 및 모달 안전 처리)
function submitStockRegister() {
    console.log("▶ 입력 완료 버튼 클릭됨");

    // 1. 버튼 포커스 해제 (크롬 aria-hidden 에러 방지)
    const btn = document.getElementById('btn-stock-submit');
    if (btn) btn.blur(); 

    // 2. 데이터 검증
    if (!tempInStockData) {
        alert("데이터가 유실되었습니다. 다시 스캔해주세요.");
        return;
    }

    const type = tempInStockData.type;
    let supplier = tempInStockData.supplier;
    let model = "";
    let color = "";

    // 3. 화면에 보이는 요소(아이폰 vs 수동) 확인
    const isIphoneMode = document.getElementById('area-iphone').style.display !== 'none';
    
    // 간편 입고 시 거래처 확인
    if (type === 'simple_open') {
        const supEl = document.getElementById('reg_modal_supplier');
        // 거래처 선택창이 존재하고 화면에 보일 때만 체크
        if (supEl && supEl.offsetParent !== null) { 
            if (!supEl.value) { alert("거래처를 선택해주세요!"); supEl.focus(); return; }
            supplier = supEl.value;
        }
    }

    // 값 추출
    if (isIphoneMode) {
        const iModel = document.getElementById('reg_iphone_model').value;
        const iStorage = document.getElementById('reg_iphone_storage').value;
        const iColor = document.getElementById('reg_iphone_color').value;
        if (!iModel || !iStorage || !iColor) { alert("아이폰 정보를 모두 선택해주세요."); return; }
        model = `${iModel}_${iStorage}`;
        color = iColor;
    } else {
        const mModel = document.getElementById('reg_manual_model').value.trim();
        const mStorage = document.getElementById('reg_manual_storage').value;
        const mColor = document.getElementById('reg_manual_color').value.trim();
        
        if (!mModel) { alert("모델명을 입력해주세요."); document.getElementById('reg_manual_model').focus(); return; }
        // 용량 필수 체크
        if (!mStorage) { alert("용량을 선택해주세요."); document.getElementById('reg_manual_storage').focus(); return; }
        if (!mColor) { alert("색상을 입력해주세요."); document.getElementById('reg_manual_color').focus(); return; }
        
        model = `${mModel}_${mStorage}`;
        color = mColor;
    }

    // 4. 데이터 갱신
    tempInStockData.model = model;
    tempInStockData.color = color;
    tempInStockData.supplier = supplier;

    // 5. 모달 닫기 (안전한 방식)
    const modalEl = document.getElementById('modal-stock-register');
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    
    // 연속 스캔 모드인 경우
    const toggleEl = document.getElementById('in_mode_toggle');
    if (toggleEl && toggleEl.checked) {
        inPendingList.push(tempInStockData);
        renderInList();
        modalInstance.hide();
        document.getElementById('in_scan').focus();
        return; 
    }

    // 6. 서버 전송
    if(btn) {
        btn.disabled = true;
        btn.innerText = "처리 중...";
    }

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "register_quick",
            type: type,
            barcode: tempInStockData.barcode,
            serial: tempInStockData.serial,
            model: model,
            color: color,
            supplier: supplier,
            branch: tempInStockData.branch,
            user: currentUser
        })
    })
    .then(r => r.json())
    .then(d => {
        modalInstance.hide(); // 결과와 상관없이 모달 닫기

        if(d.status === 'success') {
            if (type === 'simple_open') {
                alert("간편 입고 완료! 개통 정보를 입력합니다.");
                // 개통 화면 데이터 전달
                tempOpenStockData = {
                    inputCode: tempInStockData.serial,
                    model: model,
                    color: color,
                    serial: tempInStockData.serial,
                    branch: tempInStockData.branch,
                    supplier: supplier
                };
                // UI 갱신
                document.getElementById('target_model').innerText = `${model} (${color})`; 
                document.getElementById('target_serial').innerText = tempInStockData.serial;
                document.getElementById('target_branch').innerText = tempInStockData.branch; 
                document.getElementById('f_avalue').value = supplier; 
                refreshAddons(); 
                
                // 화면 전환
                document.getElementById('open_step_1').style.display = 'none';
                document.getElementById('open_step_2').style.display = 'block';
                setTimeout(() => document.getElementById('f_name').focus(), 300);
            } else {
                showMsg('in-msg','success',`입고 완료: ${model}`);
                document.getElementById('in_scan').focus();
            }
        } else {
            alert("오류: " + d.message);
        }
    })
    .catch(err => {
        alert("통신 오류 발생: " + err);
    })
    .finally(() => {
        if(btn) {
            btn.disabled = false;
            btn.innerText = "입력 완료";
        }
    });
}

// [3단계] 리스트 렌더링 최적화
function renderInList() { 
    renderHtmlList('in_tbody', inPendingList, (i, x) => {
        let modelHtml = i.isLoading ? `<span class="spinner-border spinner-border-sm text-primary align-middle"></span>` : i.model;
        return `
        <div class="glass-card p-2 mb-2 d-flex align-items-center text-center small">
            <div class="text-truncate text-muted" style="width: 25%;" title="${i.supplier}">${i.supplier}</div>
            <div class="text-truncate fw-bold text-primary" style="width: 25%;" title="${i.model}">${modelHtml}</div>
            <div class="text-truncate" style="width: 15%;">${i.color || '-'}</div>
            <div class="text-truncate font-monospace" style="width: 25%;" title="${i.serial}">${i.serial}</div>
            <div style="width: 10%;">
                <button class="btn btn-sm btn-link text-danger p-0" onclick="inPendingList.splice(${x},1);renderInList()">
                    <i class="bi bi-x-circle-fill"></i>
                </button>
            </div>
        </div>`;
    });
    document.getElementById('in_count').innerText = inPendingList.length; 
    document.getElementById('in_batch_area').style.display = inPendingList.length > 0 ? 'block' : 'none';
}
function clearInList() { inPendingList=[]; renderInList(); }
function submitInBatch() { 
    const count = inPendingList.length; if (count === 0) return; 
    if (!confirm(`${count}대 입고하시겠습니까?`)) return; 
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "batch_register", items: inPendingList, branch: document.getElementById('in_branch').value, user: currentUser }) })
    .then(r => r.json()).then(d => { if(d.status === 'success') { alert(d.count + "대 입고완료"); clearInList(); } else { alert(d.message); } }); 
}

// 6. 무선 개통
function handleOpenScan(e) { 
    if(e.key!=='Enter') return; const v=e.target.value.trim(); if(!v) return;
    e.target.disabled = true; document.getElementById('open_spinner').style.display = 'block';
    fetch(GAS_URL,{method:"POST",body:JSON.stringify({ action:"get_stock_info_for_open", input:v })})
    .then(r=>r.json()).then(d=>{
        if(d.status==='success') {
            tempOpenStockData = d.data; tempOpenStockData.inputCode = v; 
            document.getElementById('target_model').innerText = `${d.data.model} (${d.data.color})`; 
            document.getElementById('target_serial').innerText = d.data.serial;
            document.getElementById('target_branch').innerText = d.data.branch || "지점미상"; 
            document.getElementById('f_avalue').value = d.data.supplier || ""; refreshAddons(); 
            document.getElementById('open_step_1').style.display = 'none'; document.getElementById('open_step_2').style.display = 'block';
            document.getElementById('f_name').focus();
        } else {
            if (d.message === '재고 없음') {
                if(confirm("입고되지 않은 단말기입니다. 간편입고 처리 하시겠습니까?")) {
                    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "scan_preview", barcode: v, supplier: "", branch: "", user: currentUser }) })
                    .then(previewRes => previewRes.json()).then(previewData => {
                        let modalData = { barcode: v, serial: v }; 
                        if(previewData.status === 'iphone' || previewData.status === 'unregistered' || previewData.status === 'success') modalData = previewData.data;
                        showStockRegisterModal('simple_open', modalData);
                    });
                } else { e.target.disabled=false; e.target.value=""; e.target.focus(); }
            } else { alert(d.message); e.target.disabled=false; e.target.value=""; e.target.focus(); }
        }
    }).catch(err => { alert("통신 오류 발생"); e.target.disabled=false; }).finally(() => { document.getElementById('open_spinner').style.display = 'none'; });
}

window.submitFullContract = function() {
    const btn = document.getElementById('btn-mobile-save'); const originalText = '<i class="bi bi-save-fill"></i> 개통 및 저장 완료';
    if(!tempOpenStockData) { alert("단말기를 먼저 스캔해야 합니다 (Step 1)."); return; }
    if (!validateField('f_visit', '방문경로')) return; if (!validateField('f_name', '고객명')) return; if (!validateField('f_review', '리뷰작성여부')) return;
    let visitVal = document.getElementById('f_visit').value; if(visitVal === '기타') { if(!validateField('f_visit_etc', '상세 방문경로')) return; visitVal = "기타: " + document.getElementById('f_visit_etc').value; }
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 저장 중...`; btn.disabled = true;
    const selectedAddons = []; document.querySelectorAll('#div_addon_container .addon-check:checked').forEach(cb => selectedAddons.push(cb.value));
    const formData = {
        action: "open_stock_full", stockInput: tempOpenStockData.inputCode, user: currentUser, activationType: document.getElementById('f_act_type').value, contractType: document.getElementById('f_cont_type').value, name: document.getElementById('f_name').value, birth: document.getElementById('f_birth').value, visitPath: visitVal, phoneNumber: document.getElementById('f_phone').value, pricePlan: document.getElementById('f_plan').value, changePlan: document.getElementById('f_plan_chg').value, selectedAddons: selectedAddons, usim: document.getElementById('f_usim').value, card: document.getElementById('f_card').value, review: document.getElementById('f_review').value, aValue: document.getElementById('f_avalue').value, policy: document.getElementById('f_policy').value,
        income1: document.getElementById('f_inc1').value, income1Memo: document.getElementById('f_inc1_m').value, income2: document.getElementById('f_inc2').value, income2Memo: document.getElementById('f_inc2_m').value, income3: document.getElementById('f_inc3').value, income3Memo: document.getElementById('f_inc3_m').value, cost1: document.getElementById('f_cost1').value, cost1Memo: document.getElementById('f_cost1_m').value, cost2: document.getElementById('f_cost2').value,
        payment1: document.getElementById('f_pay1').value, payment1Method: document.getElementById('f_pay1_m').value, payment1Date: document.getElementById('f_pay1_d').value, payment2: document.getElementById('f_pay2').value, payment2Method: document.getElementById('f_pay2_m').value, payment2Date: document.getElementById('f_pay2_d').value, cash: document.getElementById('f_cash').value, payback1: document.getElementById('f_back').value, bankName: document.getElementById('f_bank').value, accountNumber: document.getElementById('f_acc').value, depositor: document.getElementById('f_holder').value,
        income4_1: document.getElementById('f_inc4').value, income4_1Method: document.getElementById('f_inc4_m').value, income4_2: document.getElementById('f_inc4_2').value, income4_2Method: document.getElementById('f_inc4_2_m').value, income5: document.getElementById('f_inc5').value, income5Method: document.getElementById('f_inc5_m').value, income6: document.getElementById('f_inc6').value, income6Memo: document.getElementById('f_inc6_m').value, comment: document.getElementById('f_comment').value
    };
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(formData) }).then(r => r.json()).then(d => { if(d.status === 'success') { alert(d.message); resetOpenForm(); } else { alert("오류: " + d.message); } }).catch(e => alert("통신 오류")).finally(() => { btn.innerHTML = originalText; btn.disabled = false; });
};

function resetOpenForm() {
    document.getElementById('open_step_1').style.display = 'block'; document.getElementById('open_step_2').style.display = 'none';
    const scanInput = document.getElementById('open_scan'); scanInput.value = ""; scanInput.disabled = false; document.getElementById('open_spinner').style.display = 'none'; scanInput.focus();
    document.querySelectorAll('#open_step_2 input').forEach(i => i.value = ""); document.querySelectorAll('#open_step_2 select').forEach(s => s.selectedIndex=0);
    document.getElementById('div_visit_etc').style.display='none'; document.getElementById('div_addon_container').innerHTML = "<span class='text-muted small'>...</span>"; tempOpenStockData = null;
}

// 7. 유선 개통
function startWiredActivation() {
    const branch = document.getElementById('wired_branch').value; const vendor = document.getElementById('w_pre_avalue').value; const type = document.getElementById('w_pre_act_type').value; const contract = document.getElementById('w_pre_cont_type').value;
    if(!branch || !vendor || !type || !contract) return alert("모든 항목을 선택해주세요.");
    document.getElementById('wired_step_1').style.display = 'none'; document.getElementById('wired_step_2').style.display = 'block';
    document.getElementById('w_avalue').value = vendor; document.getElementById('w_act_type').value = type; document.getElementById('w_cont_type').value = contract;
    document.getElementById('w_target_info').innerText = `${type} : ${contract}`; document.getElementById('w_target_branch').innerText = branch;
    renderWiredPlanInputs(contract);
}
function renderWiredPlanInputs(contractType) {
    const area = document.getElementById('w_plan_input_area'); area.innerHTML = "";
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
        income1: document.getElementById('w_inc1').value, income1Memo: document.getElementById('w_inc1_m').value, income2: document.getElementById('w_inc2').value, income2Memo: document.getElementById('w_inc2_m').value, income3: document.getElementById('w_inc3').value, income3Memo: document.getElementById('w_inc3_m').value, cost1: document.getElementById('w_cost1').value, cost1Memo: document.getElementById('w_cost1_m').value, cost2: "", 
        payment1: document.getElementById('w_pay1').value, payment1Method: document.getElementById('w_pay1_m').value, payment1Date: document.getElementById('w_pay1_d').value, payment2: document.getElementById('w_pay2').value, payment2Method: document.getElementById('w_pay2_m').value, payment2Date: document.getElementById('w_pay2_d').value, cash: document.getElementById('w_cash').value, payback1: document.getElementById('w_back').value, bankName: document.getElementById('w_bank').value, accountNumber: document.getElementById('w_acc').value, depositor: document.getElementById('w_holder').value,
        income5: document.getElementById('w_inc5').value, income5Method: document.getElementById('w_inc5_m').value, income6: document.getElementById('w_inc6').value, income6Memo: document.getElementById('w_inc6_m').value, comment: document.getElementById('w_comment').value
    };
    const btn = event.currentTarget; const originalText = btn.innerHTML; btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 저장 중...`; btn.disabled = true;
    fetch(GAS_URL, { method: "POST", body: JSON.stringify(formData) }).then(r => r.json()).then(d => { if(d.status === 'success') { alert(d.message); resetWiredForm(); } else { alert("오류: " + d.message); } }).catch(e => alert("통신 오류")).finally(() => { btn.innerHTML = originalText; btn.disabled = false; });
}

// 중고 개통 (기존 로직 동일)
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

// 9. 거래처 / 이동 / 반품 / 이력 / 조회
function loadVendorsToList() { 
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_vendors" }) }).then(r => r.json()).then(d => { 
        renderHtmlList('vendor_list_ui', d.list, v => {
            const sales = v.salesName ? `👤${v.salesName}` : '';
            const phone = v.salesPhone ? ` 📞${v.salesPhone}` : '';
            const office = v.officePhone ? ` 🏢${v.officePhone}` : '';
            const badge = v.carrier ? `<span class="badge bg-info text-dark me-2">${v.carrier}</span>` : '';
            return `
            <div class="list-group-item p-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div>${badge}<span class="fw-bold text-dark">${v.name}</span></div>
                    <button class="btn btn-sm btn-outline-danger py-0" onclick="deleteVendor('${v.name}')" style="font-size:0.8rem;">삭제</button>
                </div>
                <div class="small text-muted text-truncate">${sales}${phone}${office}</div>
            </div>`; 
        });
    }); 
}

function addVendor() { 
    const n = document.getElementById('v_name').value; 
    const type = document.getElementById('v_type').value;
    
    if(!n) return alert("거래처명을 입력하세요.");
    
    fetch(GAS_URL, { 
        method: "POST", 
        body: JSON.stringify({ 
            action: "add_vendor", 
            name: n, 
            salesName: document.getElementById('v_sales').value, 
            salesPhone: document.getElementById('v_phone').value, 
            officePhone: document.getElementById('v_office').value, 
            type: type 
        }) 
    })
    .then(r => r.json())
    .then(d => { 
        alert(d.message); 
        
        // [추가] 캐시 즉시 업데이트 (드롭다운 반영용)
        if (n && !globalVendorList.includes(n)) {
            globalVendorList.push(n);
            globalVendorList.sort(); // 가나다순 정렬
        }

        loadVendorsToList(); 
        
        // 입력창 초기화
        document.getElementById('v_name').value = ""; 
        document.getElementById('v_sales').value = ""; 
        document.getElementById('v_phone').value = ""; 
        document.getElementById('v_office').value = ""; 
        document.getElementById('v_type').selectedIndex = 0; 
    }); 
}

function deleteVendor(n) { if(confirm("정말 삭제하시겠습니까?")) fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"delete_vendor",name:n})}).then(r=>r.json()).then(d=>{alert(d.message);loadVendorsToList();}); }
function showMsg(id, type, text) { const el=document.getElementById(id); el.style.display='block'; el.className=`alert py-2 text-center small fw-bold rounded-3 alert-${type==='success'?'success':'danger'}`; el.innerText=text; setTimeout(()=>el.style.display='none',2000); }
function handleMoveScan(e) { if(e.key!=='Enter')return; const v=e.target.value.trim(); fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"transfer_stock",input:v,toBranch:document.getElementById('move_to_branch').value,user:currentUser})}).then(r=>r.json()).then(d=>showMsg('move-msg',d.status==='success'?'success':'error',d.message)).finally(()=>{e.target.value="";}); }
function handleOutScan(e) { if(e.key!=='Enter')return; const v=e.target.value.trim(); if(!document.getElementById('out_note').value){alert("반품 사유를 입력해주세요.");return;} fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"return_stock",input:v,note:document.getElementById('out_note').value,user:currentUser})}).then(r=>r.json()).then(d=>showMsg('out-msg',d.status==='success'?'success':'error',d.message)).finally(()=>{e.target.value="";}); }

// [3단계] 재고 검색 렌더링 최적화
function searchStock() { 
    const crit = document.getElementById('search_criteria').value; const val = document.getElementById('search_value').value; 
    const div = document.getElementById('stock_result'); 
    div.innerHTML = `<div class="text-center py-4"><span class="spinner-border text-primary"></span></div>`; 
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "search_stock", criteria: crit, keyword: val }) }) 
    .then(r => r.json()).then(d => { 
        if(!d.list || d.list.length === 0) { div.innerHTML = `<div class="text-center text-muted py-5">결과 없음</div>`; return; } 
        
        const rows = d.list.map(item => {
            const st = item.status === '보유' ? 'text-success' : 'text-danger'; 
            return `<tr><td>${item.date}</td><td class="fw-bold">${item.model}</td><td>${item.color}</td><td class="font-monospace">${item.serial}</td><td class="${st} fw-bold">${item.status}</td><td>${item.branch}</td></tr>`;
        }).join('');

        div.innerHTML = `<div class="table-responsive"><table class="table table-hover stock-table"><thead><tr><th>입고일</th><th>모델</th><th>색상</th><th>일련번호</th><th>상태</th><th>위치</th></tr></thead><tbody>${rows}</tbody></table></div><div class="text-end small text-muted">총 ${d.list.length}건</div>`; 
    }); 
}

function searchHistory() { 
    const k=document.getElementById('hist_keyword').value; 
    fetch(GAS_URL,{method:"POST",body:JSON.stringify({action:"search_history",keyword:k})}).then(r=>r.json()).then(d=>{ 
        renderHtmlList('hist_result', d.list, i => `
        <div class='glass-card p-3 mb-2'>
            <div class="d-flex justify-content-between align-items-center">
                <span><span class='badge bg-primary'>${i.type}</span> <span class="fw-bold small">${i.model}</span></span>
                <span class="text-muted" style="font-size:0.75rem;">${i.time}</span>
            </div>
            <div class="mt-2 small text-dark fw-bold border-top pt-2">${i.desc}</div>
            <div class="text-end text-muted small" style="font-size:0.7rem;">처리자: ${i.user}</div>
        </div>`);
    }); 
}

function updateSearchUI() { const criteria = document.getElementById('search_criteria').value; const area = document.getElementById('search_input_area'); area.innerHTML = ""; if(criteria === 'supplier') { const sel = document.createElement('select'); sel.className = "form-select"; sel.id = "search_value"; globalVendorList.forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); }); area.appendChild(sel); } else if(criteria === 'branch') { const sel = document.createElement('select'); sel.className = "form-select"; sel.id = "search_value"; ["장지 본점", "명일 직영점"].forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); }); area.appendChild(sel); } else if(criteria === 'model') { const sel = document.createElement('select'); sel.className = "form-select"; sel.id = "search_value"; globalModelList.forEach(v => { const opt = document.createElement('option'); opt.value=v; opt.innerText=v; sel.appendChild(opt); }); area.appendChild(sel); } else { const inp = document.createElement('input'); inp.className = "form-control"; inp.id = "search_value"; inp.placeholder = "입력하세요"; inp.onkeydown = function(e){ if(e.key==='Enter') searchStock(); }; area.appendChild(inp); inp.focus(); } }
