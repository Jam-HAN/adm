// ==========================================
// script.js (V56.0 - Optimized UI Rendering)
// ==========================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbzOIJy6E1X5YQvcyL_GYE8hIqUXkIUpZRH1mtRL1SCqYc6mbgx01HUErtLwxaIPHhdC/exec"; 

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
        initHistoryDates();
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
    // 1. 모바일 메뉴 닫기 (기존 코드 유지)
    const nav = document.getElementById('navbarNav');
    if (nav && nav.classList.contains('show')) {
        const bsCollapse = bootstrap.Collapse.getInstance(nav) || new bootstrap.Collapse(nav, {toggle: false});
        bsCollapse.hide();
    }
    
    // 2. 섹션 전환 (기존 코드 유지)
    document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active-section', 'fade-in'));
    document.getElementById(id).classList.add('active-section', 'fade-in');

    // ---------------------------------------------------------
    // ★ [추가된 부분] 화면 진입 시 날짜 자동 세팅 트리거
    // ---------------------------------------------------------
    if (id === 'section-search-all') initHistoryDates();
    if (id === 'section-return-usedphone') initSpecialDates('usedphone');
    if (id === 'section-receive-gift') initSpecialDates('gift');
    // ---------------------------------------------------------
    
    // 3. [핵심 수정] 입고 화면(section-in) 진입 시 로직 개선
    if(id === 'section-in') {
        // ★ 캐싱 로직: 이미 받아둔 거래처 목록이 있으면 바로 그린다 (서버 호출 X)
        if (typeof globalVendorList !== 'undefined' && globalVendorList.length > 0) {
            renderVendorDropdown(); 
        } else {
            // 없으면 서버에서 가져온다
            loadInitData(); 
        }
        
        loadDropdownData(); // 다른 드롭다운 로드
    }
    
    // 4. 기타 섹션 로직
    if(id === 'section-vendor') loadVendorsToList();
    if(id === 'section-stock') updateSearchUI();
    
    // 5. 입력창 포커스
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

// [수정] 대시보드 데이터 로드
function loadDashboard() {
    const dashList = document.getElementById('dash_today_list');
    const dashUser = document.getElementById('dash_user_rank');
    if(!dashList || !dashUser) return;

    // 로딩바 표시
    dashList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary"></div> 로딩 중...</td></tr>';
    // [수정] 높이 확보 및 중앙 정렬
    dashUser.innerHTML = '<div class="d-flex justify-content-center align-items-center" style="height:200px;"><div class="spinner-border text-success"></div></div>';

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_dashboard_data" }) })
    .then(r => r.json())
    .then(d => {
        if(d.status === 'success') { renderDashboard(d.data); } 
        else { dashList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-danger">로드 실패</td></tr>'; }
    })
    .catch(() => {
         dashList.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted">데이터 없음</td></tr>';
         dashUser.innerHTML = '<div class="text-center py-5 text-muted">데이터 연결 실패</div>';
    });
}

// [script.js] 대시보드 렌더링 (마진 컬럼 추가됨)
function renderDashboard(data) {
    // 1. 상단 숫자판
    document.getElementById('dash_today_mobile').innerText = data.today.mobile;
    document.getElementById('dash_today_wired').innerText = data.today.wired;
    
    // 2. 월간 누적
    renderHtmlList('dash_month_stats', Object.keys(data.month), b => `
        <div class="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
            <span class="fw-bold small">${b}</span>
            <div class="text-end">
                <span class="badge bg-primary me-1">📱 ${data.month[b].mobile}</span>
                <span class="badge bg-success">📺 ${data.month[b].wired}</span>
            </div>
        </div>
    `, '데이터 없음');
    
    // 3. 오늘 실시간 개통 리스트 (기존 테이블 유지 - 의도하신 대로)
    renderHtmlList('dash_today_list', data.todayList, item => {
        const marginStr = Math.floor(Number(item.margin)).toLocaleString();
        const colorClass = item.badgeColor ? `bg-${item.badgeColor}` : "bg-secondary";
        return `<tr>
            <td><span class="badge bg-secondary">${item.branch}</span></td>
            <td><span class="badge ${colorClass}">${item.type}</span></td>
            <td class="fw-bold">${item.name}님</td>
            <td class="text-muted small">${item.user}님</td>
            <td class="text-danger fw-bold text-end pe-3">${marginStr}</td>
        </tr>`;
    }, '<tr><td colspan="5" class="text-center py-4 text-muted">오늘 개통 내역이 없습니다.</td></tr>');
    
    // 4. [변경] 이달의 실적 (마진 컬럼 추가)
    const rankArea = document.getElementById('dash_user_rank');
    if (!data.userRank || data.userRank.length === 0) {
        rankArea.innerHTML = '<div class="text-center py-5 text-muted small">이달의 실적이 없습니다.</div>';
    } else {
        let html = `
            <table class="table table-hover align-middle mb-0 text-center" style="font-size: 0.9rem;">
                <thead class="bg-light text-secondary small fw-bold sticky-top">
                    <tr>
                        <th style="width:10%">순위</th>
                        <th style="width:20%">매니저</th>
                        <th style="width:15%">📱</th>
                        <th style="width:15%">📺</th>
                        <th style="width:15%">합계</th>
                        <th style="width:25%">💰 마진</th> </tr>
                </thead>
                <tbody>
        `;
        data.userRank.forEach((u, index) => {
            let rankBadge = `<span class="fw-bold text-secondary">${index + 1}</span>`;
            if (index === 0) rankBadge = `🥇`; else if (index === 1) rankBadge = `🥈`; else if (index === 2) rankBadge = `🥉`;
            
            const isMe = (typeof currentUser !== 'undefined' && u.name === currentUser) ? "bg-primary bg-opacity-10 border-start border-4 border-primary" : "";
            const marginStr = Math.floor(Number(u.margin)).toLocaleString(); // 쉼표 포맷팅

            html += `
                <tr class="${isMe}">
                    <td>${rankBadge}</td>
                    <td class="fw-bold text-dark">${u.name}</td>
                    <td class="text-muted">${u.mobile}</td>
                    <td class="text-muted">${u.wired}</td>
                    <td class="fw-bold fs-6">${u.total}</td>
                    <td class="fw-bold text-danger">${marginStr}</td> </tr>
            `;
        });
        html += `</tbody></table>`;
        rankArea.innerHTML = html;
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

// [캐싱 적용] 저장된 리스트를 화면에 그려주는 함수
function renderVendorDropdown() {
    const sel = document.getElementById('in_supplier');
    if (!sel) return;

    // 1. 기본 옵션
    let html = '<option value="" selected>선택하세요</option>';

    // 2. 캐시된 데이터(globalVendorList)가 있으면 그걸로 목록 생성
    if (globalVendorList && globalVendorList.length > 0) {
        html += globalVendorList.map(v => `<option value="${v}">${v}</option>`).join('');
    }

    sel.innerHTML = html;
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

// [추가 1] 모든 모바일 메뉴 닫기 (배경 클릭 시 실행됨)
function closeAllMobileMenus() {
    const overlay = document.getElementById('fab-menu-overlay');
    
    // 1. 더하기 메뉴 닫기
    const fabMenu = document.getElementById('fab-menu-container');
    if (fabMenu) {
        fabMenu.classList.add('d-none');
        fabMenu.classList.remove('d-flex');
    }

    // 2. 조회 메뉴 닫기
    const searchMenu = document.getElementById('search-menu-container');
    if (searchMenu) {
        searchMenu.classList.add('d-none');
        searchMenu.classList.remove('d-flex');
    }
    
    // 3. 오버레이(배경) 숨기기
    if (overlay) overlay.classList.add('d-none');
    
    // 4. 더하기 아이콘 원상복구 (X -> +)
    const fabIcon = document.querySelector('.center-fab .bi');
    if(fabIcon) { 
        fabIcon.classList.remove('bi-x-lg'); 
        fabIcon.classList.add('bi-plus-lg'); 
    }
}

// [누락된 함수 추가] 더하기(+) 메뉴 토글 함수
function toggleFabMenu() {
    const overlay = document.getElementById('fab-menu-overlay');
    const menu = document.getElementById('fab-menu-container');
    const fabIcon = document.querySelector('.center-fab .bi');
    
    // 만약 조회 메뉴가 열려있으면 닫아버림 (겹침 방지)
    const searchMenu = document.getElementById('search-menu-container');
    if (searchMenu && !searchMenu.classList.contains('d-none')) {
        // toggleSearchMenu()를 부르면 서로 닫으려다가 무한루프 돌 수 있으니 직접 닫음
        searchMenu.classList.add('d-none');
        searchMenu.classList.remove('d-flex');
    }

    if (menu.classList.contains('d-none')) {
        // 메뉴 열기
        menu.classList.remove('d-none');
        menu.classList.add('d-flex');
        overlay.classList.remove('d-none'); // 배경 켜기
        
        // 아이콘 회전 효과 (+ -> X)
        if(fabIcon) { fabIcon.classList.remove('bi-plus-lg'); fabIcon.classList.add('bi-x-lg'); }
    } else {
        // 메뉴 닫기
        menu.classList.add('d-none');
        menu.classList.remove('d-flex');
        overlay.classList.add('d-none'); // 배경 끄기
        
        // 아이콘 복구 (X -> +)
        if(fabIcon) { fabIcon.classList.remove('bi-x-lg'); fabIcon.classList.add('bi-plus-lg'); }
    }
}

// [추가 2] 조회 메뉴 토글 (돋보기 아이콘 클릭 시)
function toggleSearchMenu() {
    const overlay = document.getElementById('fab-menu-overlay');
    const menu = document.getElementById('search-menu-container');
    
    // 만약 더하기 메뉴가 열려있으면 닫아버림 (겹침 방지)
    const fabMenu = document.getElementById('fab-menu-container');
    if (fabMenu && !fabMenu.classList.contains('d-none')) {
        fabMenu.classList.add('d-none');
        fabMenu.classList.remove('d-flex');
        // 아이콘 복구
        const fabIcon = document.querySelector('.center-fab .bi');
        if(fabIcon) { fabIcon.classList.remove('bi-x-lg'); fabIcon.classList.add('bi-plus-lg'); }
    }

    if (menu.classList.contains('d-none')) {
        // 메뉴 열기
        menu.classList.remove('d-none');
        menu.classList.add('d-flex');
        overlay.classList.remove('d-none'); // 배경 켜기
    } else {
        // 메뉴 닫기
        menu.classList.add('d-none');
        menu.classList.remove('d-flex');
        overlay.classList.add('d-none'); // 배경 끄기
    }
}

// ==========================================
// [추가] 통합 개통 이력 관리 로직
// ==========================================

// 1. 날짜 기본값 세팅 (이번달 1일 ~ 오늘)
function initHistoryDates() {
    const today = new Date();
    // 이번 달 1일 생성
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // [핵심 수정] UTC 변환 없이, 현재 PC 시간 그대로 'YYYY-MM-DD' 문자열 만들기
    const fmt = d => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0'); // 월은 0부터 시작하므로 +1
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // 시작일(1일)과 종료일(오늘) 입력
    if(document.getElementById('hist_start_date')) document.getElementById('hist_start_date').value = fmt(firstDay);
    if(document.getElementById('hist_end_date')) document.getElementById('hist_end_date').value = fmt(today);
}

// [최종 수정] 통합 검색 결과 렌더링 (담당매니저 위치 수정: 이름/정보 우측 끝)
function searchAllHistory() {
    const start = document.getElementById('hist_start_date').value;
    const end = document.getElementById('hist_end_date').value;
    const keyword = document.getElementById('hist_all_keyword').value;
    const branch = document.getElementById('hist_branch_filter').value;
    const resArea = document.getElementById('hist_all_result');
    
    // UI 초기화
    resArea.classList.remove('list-group', 'list-group-flush');
    resArea.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div><div class="mt-2 small text-muted">데이터 조회 중...</div></div>';
    
    fetch(GAS_URL, { 
        method: "POST", 
        body: JSON.stringify({ action: "get_all_history", start, end, keyword, branch }) 
    })
    .then(r => r.json())
    .then(d => {
        if (d.status === 'success' && d.data.length > 0) {
            let html = '';
            d.data.forEach(item => {
                const jsonItem = JSON.stringify(item).replace(/"/g, '&quot;');
                
                // 뱃지 색상 설정
                let badgeClass = 'bg-primary';
                if(item.sheetName === '유선개통') badgeClass = 'bg-success';
                else if(item.sheetName === '중고개통') badgeClass = 'bg-warning text-white'; 
                
                // 데이터 null 처리
                const contact = item['연락처'] || '-';
                const carrier = item['개통처'] || item['통신사'] || '-'; 
                const type = item['개통유형'] || '-';
                const contract = item['약정유형'] || '-';
                const manager = item['담당자'] || '미지정';
                
                const model = item['모델명'] || '-';
                const serial = item['일련번호'] || '';
                const plan = item['요금제'] || '-';
                const addon = item['부가서비스'] || '';
                const card = item['제휴카드'] || '';

                // [카드 구성]
                html += `
                <div class="glass-card p-3 mb-3 w-100 d-block" onclick="openEditModal(${jsonItem})" style="cursor:pointer; transition: transform 0.2s;">
                    
                    <div class="d-flex w-100 justify-content-between align-items-center mb-2 border-bottom pb-2">
                        <div>
                            <span class="badge ${badgeClass} me-1">${item.sheetName}</span>
                            <span class="badge bg-white text-secondary border">${item['지점'] || '-'}</span>
                        </div>
                        <small class="fw-bold text-dark">${item['개통일']}</small>
                    </div>
                    
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <div class="text-truncate me-2">
                            <span class="fw-bold text-primary fs-5 me-2">${item['고객명']}</span>
                            <span class="small text-dark">
                                ${contact} <span class="text-muted mx-1">|</span>
                                ${carrier} <span class="text-muted mx-1">|</span>
                                ${type} <span class="text-muted mx-1">|</span>
                                ${contract}
                            </span>
                        </div>
                        <span class="badge bg-white text-primary border rounded-pill px-2 shadow-sm text-nowrap">
                            <i class="bi bi-person-circle me-1"></i>${manager}
                        </span>
                    </div>

                    <div class="text-muted small text-truncate bg-light p-2 rounded">
                        <span class="fw-bold text-dark">${model}</span> 
                        ${serial ? ` : ${serial}` : ''}
                        <span class="mx-2 text-secondary">|</span> 
                        ${plan}
                        ${addon ? ` <span class="mx-2 text-secondary">|</span> ${addon}` : ''}
                        ${card ? ` <span class="mx-2 text-secondary">|</span> ${card}` : ''}
                    </div>
                </div>`;
            });
            resArea.innerHTML = html;
        } else {
            resArea.innerHTML = '<div class="text-center py-5 text-muted">조건에 맞는 결과가 없습니다.</div>';
        }
    })
    .catch(err => {
        console.error(err);
        resArea.innerHTML = '<div class="text-center py-5 text-danger">통신 오류가 발생했습니다.</div>';
    });
}

// [최종 수정] 개통 정보 수정 모달 (상단 모델/요금제 정보 삭제로 심플화)
function openEditModal(item) {
    // [안전장치] 데이터 로딩 체크
    if (!globalDropdownData || !globalDropdownData.visitList || globalDropdownData.visitList.length === 0) {
        Swal.fire({
            title: '데이터 로딩 중...', text: '필수 목록 데이터를 불러오고 있습니다. 잠시만 기다려주세요.',
            allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }
        });
        fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_dropdown_data" }) })
        .then(r => r.json()).then(d => {
            Swal.close();
            if(d.status === 'success') { globalDropdownData = d; applyDropdownData(d); openEditModal(item); }
            else { alert("데이터 로드 실패: " + d.message); }
        }).catch(e => { Swal.close(); alert("서버 통신 오류"); });
        return;
    }

    // 식별자 값 세팅
    document.getElementById('edit_sheet_name').value = item.sheetName;
    document.getElementById('edit_row_index').value = item.rowIndex;
    document.getElementById('edit_branch_name').value = item.branch || item['지점'];
    
    const container = document.getElementById('edit_form_container');
    container.innerHTML = ''; 

    // --- 헬퍼 함수 (data-original 속성 추가됨) ---
    const makeInput = (label, key, width = 'col-6', type = 'text', isDanger = false, isReadOnly = false) => {
        let val = item[key] || '';
        
        // 날짜 자르기 로직
        const dateKeys = ['요금제변경일', '부가서비스해지일', '대납1요청일', '대납2요청일', '처리일', '개통일'];
        if (dateKeys.includes(key) && typeof val === 'string' && val.includes('T')) {
            val = val.split('T')[0];
        }

        const labelClass = isDanger ? "form-label-sm text-danger-custom" : "form-label-sm";
        let inputClass = isDanger ? "form-control form-control-sm edit-input border-danger-custom" : "form-control form-control-sm edit-input";
        let readOnlyAttr = "";
        
        if (isReadOnly) {
            inputClass += " bg-light text-muted"; 
            readOnlyAttr = "readonly tabindex='-1'";
        }

        // [핵심] data-original="${val}" 추가 -> 나중에 변경 비교용
        return `
            <div class="${width}">
                <label class="${labelClass}">${label}</label>
                <input type="${type}" class="${inputClass}" data-key="${key}" value="${val}" data-original="${val}" ${readOnlyAttr}>
            </div>`;
    };

    const makeSelect = (label, key, options, width = 'col-6') => {
        const val = item[key] || '';
        const safeOptions = options || [];
        let optsHtml = safeOptions.map(opt => `<option value="${opt}" ${val === opt ? 'selected' : ''}>${opt}</option>`).join('');
        if(val && !safeOptions.includes(val)) optsHtml += `<option value="${val}" selected>${val} (기존값)</option>`;
        
        // [핵심] data-original="${val}" 추가
        return `<div class="${width}"><label class="form-label-sm">${label}</label><select class="form-select form-select-sm edit-input" data-key="${key}" data-original="${val}"><option value="">선택</option>${optsHtml}</select></div>`;
    };

    // 설정 데이터
    const dd = globalDropdownData || {}; 
    const visitList = dd.visitList || [];
    const usimList = dd.usimList || [];
    const reviewList = dd.reviewList || [];
    const payMethodList = dd.payMethodList || [];
    const colMethodList = dd.colMethodList || [];

    let badgeClass = 'bg-primary';
    if (item.sheetName === '유선개통') badgeClass = 'bg-success';
    else if (item.sheetName === '중고개통') badgeClass = 'bg-warning text-white';

    // ==========================================
    // 1. [상단] 요약 정보 (심플 버전)
    // ==========================================
    let headerHtml = `
        <div class="col-12 mb-2">
            <div class="card border-0 shadow-sm bg-light">
                <div class="card-body p-3">
                    
                    <div class="d-flex w-100 justify-content-between align-items-center mb-2 border-bottom pb-2">
                        <div>
                            <span class="badge ${badgeClass} me-1">${item.sheetName}</span>
                            <span class="badge bg-white text-secondary border">${item['지점'] || '-'}</span>
                        </div>
                        <small class="fw-bold text-dark">${item['개통일']}</small>
                    </div>

                    <div class="d-flex justify-content-between align-items-center">
                        <div class="text-truncate me-2">
                            <span class="fw-bold text-primary fs-5 me-2">${item['고객명']}</span>
                            <span class="small text-dark">
                                ${item['연락처'] || '-'} <span class="text-muted mx-1">|</span>
                                ${item['개통처'] || '-'} <span class="text-muted mx-1">|</span>
                                ${item['개통유형'] || '-'} <span class="text-muted mx-1">|</span>
                                ${item['약정유형'] || '-'}
                            </span>
                        </div>
                        <span class="badge bg-white text-primary border rounded-pill px-2 shadow-sm text-nowrap">
                            <i class="bi bi-person-circle me-1"></i>${item['담당자'] || '미지정'}
                        </span>
                    </div>

                    </div>
            </div>
        </div>
    `;
    container.innerHTML += headerHtml;

    // ==========================================
    // 2. [기본 정보]
    // ==========================================
    let sectionBasic = `
        <div class="divider"></div>
        <div class="section-header"><i class="bi bi-person-badge"></i> 기본 정보</div>
        <div class="row g-2">
            ${makeInput('개통유형', '개통유형', 'col-4', 'text', false, true)}
            ${makeInput('약정유형', '약정유형', 'col-4', 'text', false, true)}
            ${makeSelect('방문경로', '방문경로', visitList, 'col-4')}

            ${makeInput('고객명', '고객명', 'col-4')}
            ${makeInput('생년월일', '생년월일', 'col-4')}
            ${makeInput('연락처', '연락처', 'col-4')}

            ${makeInput('요금제', '요금제', 'col-4')}
            ${makeInput('변경요금제', '변경요금제', 'col-4')}
            ${makeInput('요금제변경일', '요금제변경일', 'col-4', 'text', false, true)}

            ${makeInput('부가서비스', '부가서비스', 'col-8')}
            ${makeInput('부가서비스해지일', '부가서비스해지일', 'col-4', 'text', false, true)}

            ${makeInput('제휴카드', '제휴카드', 'col-6')}
            ${makeSelect('리뷰작성', '리뷰작성', reviewList, 'col-6')}
        </div>
    `;
    container.innerHTML += sectionBasic;

    // ==========================================
    // 3. [정책 및 정산]
    // ==========================================
    let sectionPolicy = `
        <div class="divider"></div>
        <div class="section-header"><i class="bi bi-calculator"></i> 정책 및 정산</div>
        <div class="row g-2">
            ${makeInput('개통처', '개통처', 'col-6', 'text', false, true)}
            ${makeInput('정책차수', '정책차수', 'col-6')}
            
            ${makeInput('액면/히든', '정책금액(액면)', 'col-6', 'number')}
            ${makeInput('메모', '메모(액면)', 'col-6')}
            
            ${makeInput('추가정책', '추가정책', 'col-6', 'number')}
            ${makeInput('메모', '메모(추가)', 'col-6')}
            
            ${makeInput('부가정책', '부가정책', 'col-6', 'number')}
            ${makeInput('메모', '메모(부가)', 'col-6')}
            
            ${makeInput('차감정책', '차감정책', 'col-6', 'number', true)}
            ${makeInput('메모', '메모(차감)', 'col-6')}
            
            ${makeInput('프리할인', '프리할인', 'col-6', 'number', true)}
            ${makeSelect('유심', '유심비', usimList, 'col-6')}
        </div>
    `;
    container.innerHTML += sectionPolicy;

    // ==========================================
    // 4. [대납 및 지원]
    // ==========================================
    let sectionSupport = `
        <div class="divider"></div>
        <div class="section-header"><i class="bi bi-credit-card"></i> 대납 및 지원</div>
        <div class="row g-2">
            ${makeInput('대납1', '대납1', 'col-4', 'number', true)}
            ${makeSelect('방법', '대납1방법', payMethodList, 'col-4')}
            ${makeInput('처리일', '대납1요청일', 'col-4', 'text', false, true)}
            
            ${makeInput('대납2', '대납2', 'col-4', 'number', true)}
            ${makeSelect('방법', '대납2방법', payMethodList, 'col-4')}
            ${makeInput('처리일', '대납2요청일', 'col-4', 'text', false, true)}
            
            ${makeInput('현금지급', '현금지급', 'col-6', 'number', true)}
            ${makeInput('페이백', '페이백', 'col-6', 'number', true)}
            
            ${makeInput('은행명', '은행명', 'col-4')}
            ${makeInput('계좌번호', '계좌번호', 'col-4')}
            ${makeInput('예금주', '예금주', 'col-4')}
        </div>
    `;
    container.innerHTML += sectionSupport;

    // ==========================================
    // 5. [수납 상세]
    // ==========================================
    let sectionCollect = `
        <div class="divider"></div>
        <div class="section-header"><i class="bi bi-wallet2"></i> 수납 상세</div>
        <div class="row g-2">
            ${makeInput('단말기수납1', '단말기수납1', 'col-6', 'number')}
            ${makeSelect('방법', '단말기수납1방법', colMethodList, 'col-6')}

            ${makeInput('단말기수납2', '단말기수납2', 'col-6', 'number')}
            ${makeSelect('방법', '단말기수납2방법', colMethodList, 'col-6')}
            
            ${makeInput('요금수납', '요금수납', 'col-6', 'number')}
            ${makeSelect('방법', '요금수납방법', colMethodList, 'col-6')}
            
            ${makeInput('중고폰', '중고폰반납', 'col-6', 'number')}
            ${makeInput('메모', '중고폰메모', 'col-6')}
            
            ${makeInput('기타 특이사항', '특이사항', 'col-12')}
        </div>
    `;
    container.innerHTML += sectionCollect;

    // [하단 버튼]
    const footer = document.querySelector('#modal-edit-history .modal-footer');
    if(footer) footer.style.display = 'none';

    let buttonSection = `
        <div class="mt-4 pt-3 border-top d-flex justify-content-between align-items-center gap-2">
            <button type="button" class="btn btn-outline-danger py-2 px-3 fw-bold" onclick="deleteHistoryItem()">
                <i class="bi bi-trash3"></i> 개통 취소
            </button>
            <div class="d-flex gap-2 flex-grow-1 justify-content-end">
                <button type="button" class="btn btn-light border py-2 px-3 fw-bold text-secondary" data-bs-dismiss="modal">
                    <i class="bi bi-x-lg"></i> 수정 취소
                </button>
                <button type="button" class="btn btn-primary py-2 px-4 fw-bold shadow-sm flex-grow-1" onclick="submitEditHistory()" style="max-width: 250px;">
                    <i class="bi bi-check-lg"></i> 수정사항 저장
                </button>
            </div>
        </div>
    `;
    container.innerHTML += buttonSection;

    const modal = new bootstrap.Modal(document.getElementById('modal-edit-history'));
    modal.show();
}

// [최종 수정] 저장 시 텍스트("작성")를 Boolean(true)으로 변환 전송
function submitEditHistory() {
    const sheetName = document.getElementById('edit_sheet_name').value;
    const rowIndex = document.getElementById('edit_row_index').value;
    const branch = document.getElementById('edit_branch_name').value;

    if (!sheetName || !rowIndex || !branch) {
        alert("필수 데이터 오류");
        return;
    }

    const formData = {
        sheetName: sheetName,
        rowIndex: rowIndex,
        branch: branch,
        action: "update_history" 
    };

    const inputs = document.querySelectorAll('.edit-input');
    let changeCount = 0; 

    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        let currentVal = input.value;
        const originalVal = input.getAttribute('data-original') || '';

        // [핵심] 값이 변경되었는지 비교
        if (String(currentVal) !== String(originalVal)) {
            
            // [변환] 리뷰작성의 경우: "작성" -> true, "미작성" -> false 로 변환
            if (key === '리뷰작성') {
                formData[key] = (currentVal === '작성'); 
            } else {
                formData[key] = currentVal;
            }
            changeCount++;
        }
    });

    if (changeCount === 0) {
        Swal.fire({ icon: 'info', title: '변경사항 없음', text: '수정된 내용이 없습니다.' });
        return;
    }

    Swal.fire({
        title: '저장 중...', text: `${changeCount}건의 변경사항을 저장합니다.`,
        allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }
    });

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(formData)
    })
    .then(r => r.json())
    .then(data => {
        Swal.close();
        if (data.status === 'success') {
            Swal.fire({ icon: 'success', title: '저장 완료', text: '수정사항이 반영되었습니다.', timer: 1500 });
            
            const modalEl = document.getElementById('modal-edit-history');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            const activeSection = document.querySelector('.section-view.active-section');
            if (activeSection && activeSection.id === 'section-history-all') {
                searchAllHistory(); 
            } else {
                loadDashboard(); 
            }
        } else {
            Swal.fire({ icon: 'error', title: '저장 실패', text: data.message });
        }
    })
    .catch(err => {
        Swal.close();
        console.error(err);
        Swal.fire({ icon: 'error', title: '통신 오류', text: '서버와 연결할 수 없습니다.' });
    });
}

// [추가 수정] 개통 취소(삭제) 확인 메시지 변경
function deleteHistoryItem() {
    const sheetName = document.getElementById('edit_sheet_name').value;
    const rowIndex = document.getElementById('edit_row_index').value;
    const branchName = document.getElementById('edit_branch_name').value;
    
    // 메시지 변경: '이 내역 삭제' -> '개통 취소'
    if(!confirm("정말 [개통 취소] 처리 하시겠습니까?\n\n(주의: 재고는 자동으로 복구되지 않으므로 재고 조정이 필요할 수 있습니다.)")) return;
    
    fetch(GAS_URL, { 
        method: "POST", 
        body: JSON.stringify({ action: "delete_history", sheetName, rowIndex, branchName }) 
    })
    .then(r => r.json())
    .then(d => {
        alert(d.message);
        bootstrap.Modal.getInstance(document.getElementById('modal-edit-history')).hide();
        searchAllHistory(); // 목록 갱신
    });
}

// =========================================================
// [최종] 중고폰 반납 / 상품권 수령 관리 로직 (기능 개선)
// =========================================================

// [헬퍼] 날짜 초기화 (당월 1일 ~ 오늘)
function initSpecialDates(type) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // YYYY-MM-DD 포맷 함수
    const fmt = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    if (type === 'usedphone') {
        if(!document.getElementById('search_return_start').value) document.getElementById('search_return_start').value = fmt(firstDay);
        if(!document.getElementById('search_return_end').value) document.getElementById('search_return_end').value = fmt(today);
    } else {
        if(!document.getElementById('search_gift_start').value) document.getElementById('search_gift_start').value = fmt(firstDay);
        if(!document.getElementById('search_gift_end').value) document.getElementById('search_gift_end').value = fmt(today);
    }
}

// 1. 통합 조회 함수 (렌더링 방식 개선: += 제거)
function searchSpecialList(type) {
    let branch, keyword, containerId, start, end;
    
    if (type === 'usedphone') {
        branch = document.getElementById('search_return_branch').value;
        keyword = document.getElementById('search_return_keyword').value;
        start = document.getElementById('search_return_start').value;
        end = document.getElementById('search_return_end').value;
        containerId = 'return-usedphone-list'; // HTML ID 꼭 확인하세요!
    } else {
        branch = document.getElementById('search_gift_branch').value;
        keyword = document.getElementById('search_gift_keyword').value;
        start = document.getElementById('search_gift_start').value;
        end = document.getElementById('search_gift_end').value;
        containerId = 'receive-gift-list';
    }

    if (!start || !end) {
        initSpecialDates(type);
        start = (type==='usedphone') ? document.getElementById('search_return_start').value : document.getElementById('search_gift_start').value;
        end = (type==='usedphone') ? document.getElementById('search_return_end').value : document.getElementById('search_gift_end').value;
    }

    const container = document.getElementById(containerId);
    if (!container) return; // 안전장치

    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action: "get_all_history", start, end, keyword, branch })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'success' && data.data.length > 0) {
            const filtered = data.data.filter(item => {
                if (type === 'usedphone') {
                    return item.sheetName !== '유선개통';
                } else {
                    const targetTypes = ['유선동판', '유선단품', '약정갱신'];
                    return item.sheetName === '유선개통' && targetTypes.includes(item['개통유형']);
                }
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div class="text-center text-muted py-5 small">조건에 맞는 대상이 없습니다.</div>';
                return;
            }

            // ★ [개선] HTML을 한 번에 모아서 집어넣기 (속도 향상 & 깨짐 방지)
            const htmlString = filtered.map(item => renderSpecialCard(item, type)).join('');
            container.innerHTML = htmlString;

        } else {
            container.innerHTML = '<div class="text-center text-muted py-5 small">검색 결과가 없습니다.</div>';
        }
    })
    .catch(err => {
        console.error(err);
        container.innerHTML = '<div class="text-center text-danger py-5 small">오류 발생</div>';
    });
}

// 2. 카드 렌더링 (원상 복구: 깔끔한 디자인 + 중앙 뱃지)
function renderSpecialCard(item, type) {
    const amount = Number(String(item['중고폰반납'] || 0).replace(/,/g, ''));
    
    // 1. 상태 뱃지 설정 (크고 잘 보이게 유지)
    let statusBadge = '';
    if (amount > 0) {
        const label = (type === 'usedphone') ? '반납완료' : '수령완료';
        statusBadge = `<span class="badge bg-success rounded-pill px-4 py-2 fs-6 shadow-sm"><i class="bi bi-check-lg me-1"></i>${label}</span>`;
    } else {
        const label = (type === 'usedphone') ? '미반납' : '미수령';
        statusBadge = `<span class="badge bg-danger bg-opacity-75 rounded-pill px-4 py-2 fs-6 shadow-sm animate__animated animate__pulse animate__infinite">${label}</span>`;
    }

    // 2. 상단 뱃지 색상
    let typeBadgeClass = 'bg-primary';
    if(item.sheetName === '유선개통') typeBadgeClass = 'bg-success';
    else if(item.sheetName === '중고개통') typeBadgeClass = 'bg-warning text-dark';

    const itemStr = JSON.stringify(item).replace(/"/g, '&quot;');

    // 3. UI 렌더링
    return `
    <div class="glass-card p-3 mb-3 w-100 d-block" onclick="openSpecialModal(${itemStr}, '${type}')" style="cursor:pointer; transition: transform 0.2s;">
        
        <div class="d-flex w-100 justify-content-between align-items-center mb-3 border-bottom pb-2">
            <div>
                <span class="badge ${typeBadgeClass} me-1">${item.sheetName}</span>
                <span class="badge bg-white text-secondary border">${item['지점'] || '-'}</span>
            </div>
            <small class="fw-bold text-dark">${item['개통일']}</small>
        </div>
        
        <div class="d-flex justify-content-between align-items-center mb-4">
            <div class="text-truncate me-2">
                <span class="fw-bold text-primary fs-5 me-2">${item['고객명']}</span>
                <span class="small text-dark">
                    ${item['연락처']} <span class="text-muted mx-1">|</span>
                    ${item['개통처']} <span class="text-muted mx-1">|</span>
                    ${item['개통유형']} <span class="text-muted mx-1">|</span>
                    ${item['약정유형']}
                </span>
            </div>
            <span class="badge bg-white text-primary border rounded-pill px-2 shadow-sm text-nowrap">
                <i class="bi bi-person-circle me-1"></i>${item['담당자'] || '미지정'}
            </span>
        </div>

        <div class="d-flex justify-content-center mt-1">
            ${statusBadge}
        </div>
    </div>`;
}

// 3. 모달 열기 (라벨 텍스트 동적 변경)
function openSpecialModal(item, type) {
    document.getElementById('sp_sheetName').value = item.sheetName;
    document.getElementById('sp_rowIndex').value = item.rowIndex;
    document.getElementById('sp_branch').value = item.branch;
    document.getElementById('sp_type').value = type;

    document.getElementById('sp_customer_name').innerText = item['고객명'];
    document.getElementById('sp_customer_info').innerText = `${item['연락처']} | ${item['개통일']}`;

    // 1) [요청 1] 라벨 텍스트 변경
    const amtLabel = document.getElementById('sp_amt_label');
    const dateLabel = document.getElementById('sp_date_label');
    const modalTitle = document.getElementById('special-modal-title');
    const modelGroup = document.getElementById('sp_model_group');

    if (type === 'usedphone') {
        modalTitle.innerText = "중고폰 반납 등록";
        amtLabel.innerText = "정산 금액 (반납 금액)";
        dateLabel.innerText = "반납일";
        modelGroup.style.display = 'block'; 
    } else {
        modalTitle.innerText = "상품권 수령 등록";
        amtLabel.innerText = "정산 금액 (수령 금액)";
        dateLabel.innerText = "수령일";
        modelGroup.style.display = 'none'; 
    }

    // 2) 기존 값 채우기
    const existingAmount = item['중고폰반납'] || ''; 
    document.getElementById('sp_amount').value = existingAmount ? Number(String(existingAmount).replace(/,/g,'')).toLocaleString() : '';
    
    const memo = item['중고폰메모'] || ''; 
    let savedDate = '';
    let savedModel = '';

    if (memo) {
        if (memo.length >= 10 && memo.includes('-')) savedDate = memo.substring(0, 10);
        if (type === 'phone' && memo.includes('/')) {
            let parts = memo.split('/');
            if (parts.length > 1) savedModel = parts[1].replace(' 반납', '').trim();
        }
    }

    document.getElementById('sp_date').value = savedDate || new Date().toISOString().split('T')[0];
    document.getElementById('sp_model_name').value = savedModel;

    new bootstrap.Modal(document.getElementById('modal-special-update')).show();
}

// 4. 저장하기
function submitSpecialUpdate() {
    const type = document.getElementById('sp_type').value;
    const amountStr = document.getElementById('sp_amount').value;
    const dateVal = document.getElementById('sp_date').value;
    const modelVal = document.getElementById('sp_model_name').value;
    
    let memoText = "";
    if (type === 'usedphone') {
        const model = modelVal.trim() || "모델미지정";
        memoText = `${dateVal} / ${model} 반납`;
    } else {
        memoText = `${dateVal} 수령`;
    }

    const formData = {
        action: "update_history",
        sheetName: document.getElementById('sp_sheetName').value,
        rowIndex: document.getElementById('sp_rowIndex').value,
        branch: document.getElementById('sp_branch').value,
        '중고폰반납': amountStr, 
        '중고폰메모': memoText
    };

    Swal.fire({ title: '저장 중...', didOpen: () => Swal.showLoading() });

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify(formData)
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'success') {
            Swal.fire({ icon: 'success', title: '처리 완료', timer: 1000, showConfirmButton: false });
            bootstrap.Modal.getInstance(document.getElementById('modal-special-update')).hide();
            searchSpecialList(type);
        } else {
            Swal.fire({ icon: 'error', title: '실패', text: data.message });
        }
    });
}
