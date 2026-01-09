// ==========================================
// script.js (V56.0 - Optimized UI Rendering)
// ==========================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbxVfZJV7fS-qrl6pdd-fUduJfpRI1cAdGu9l1eHj1eLYyDQDyNKUgBntbzUTPNKFNK9/exec"; 

// ============================================================
// [Core] 통신 전용 엔진 (재시도 로직 + 타임아웃 처리 포함)
// ============================================================
async function requestAPI(payload, retries = 2) {
    const timeout = 15000; // 15초 타임아웃 설정
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(GAS_URL, {
            method: "POST",
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        
        const json = await response.json();
        return json;

    } catch (error) {
        clearTimeout(id);
        console.warn(`통신 실패 (남은 재시도: ${retries}):`, error);
        
        if (retries > 0) {
            // 0.5초 대기 후 재시도 (Backoff)
            await new Promise(res => setTimeout(res, 500));
            return requestAPI(payload, retries - 1);
        }
        throw error;
    }
}

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
            sessionStorage.setItem('dbphone_user', JSON.stringify({ name: d.name, email: d.user, role: d.role }));
            currentUser = d.name;
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('main-view').style.display = 'block';
            document.getElementById('user-name').innerText = currentUser;
            checkAuthMenu(); // ★ 메뉴 숨기기 함수 호출
            loadInitData();
            loadDropdownData();
            setupAutoLogout();
            loadDashboard();
            initHistoryDates(); // 기존: 통합 조회 날짜 세팅
            initSetupDates();
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
    
    // 3. [핵심 수정] 로그인 세션 복구 로직 (에러 방지 Try-Catch 추가)
    const saved = sessionStorage.getItem('dbphone_user');
    if(saved) {
        try {
            const u = JSON.parse(saved); // ★ 여기서 에러나면 catch로 이동
            
            // 데이터가 정상이면 실행
            currentUser = u.name;
            document.getElementById('login-view').style.display = 'none';
            document.getElementById('main-view').style.display = 'block';
            document.getElementById('user-name').innerText = currentUser;

            checkAuthMenu(); // ★ 새로고침 해도 메뉴 검사 실행
            loadDashboard(); // 대시보드 먼저 실행
            loadInitData();
            loadDropdownData();
            setupAutoLogout();
            initHistoryDates();

        } catch (e) {
            console.error("세션 데이터 손상됨. 초기화합니다.", e);
            sessionStorage.removeItem('dbphone_user'); // 1. 깨진 정보 삭제
            alert("로그인 정보가 만료되었습니다. 다시 로그인해주세요.");
            location.reload(); // 2. 새로고침 (로그인 화면으로 이동)
        }
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

//  3단계 권한 제어 함수
function checkAuthMenu() {
    const saved = sessionStorage.getItem('dbphone_user');
    if (!saved) return;

    const u = JSON.parse(saved);
    const role = u.role || 'STAFF'; // 기본값 STAFF

    // --- [PC 메뉴 ID] ---
    const pcDbView = document.getElementById('menu_db_view_item');   // DB열람
    const pcDaily  = document.getElementById('menu_daily_sales');    // 일별집계
    const pcPeriod = document.getElementById('menu_period_item');    // 기간별
    const pcReport = document.getElementById('menu_daily_report');   // 일일보고
    
    // --- [모바일 메뉴 ID] ---
    const mbDaily  = document.getElementById('mobile_btn_daily');    // 모바일 일별
    const mbPeriod = document.getElementById('mobile_btn_period');   // 모바일 기간별
    const mbReport = document.getElementById('mobile_btn_daily_report'); // 모바일 일일보고

    // 1. 초기화: 일단 중요 메뉴는 다 숨김 (보안)
    if(pcDbView) pcDbView.style.display = 'none';
    if(pcDaily)  pcDaily.style.display = 'none';
    if(pcPeriod) pcPeriod.style.display = 'none';
    if(pcReport) pcReport.style.display = 'none';
    
    if(mbDaily)  mbDaily.style.display = 'none';
    if(mbPeriod) mbPeriod.style.display = 'none';
    if(mbReport) mbReport.style.display = 'none';
    
    // 2. 권한 확인: 사장님(MASTER)만 보여줌
    if (role === 'MASTER') {
        // PC 보이기
        if(pcDbView) pcDbView.style.display = 'block';
        if(pcDaily)  pcDaily.style.display = 'block';
        if(pcPeriod) pcPeriod.style.display = 'block'; 
        if(pcReport) pcReport.style.display = 'block';

        // 모바일 보이기
        if(mbDaily)  mbDaily.style.display = 'block';
        if(mbPeriod) mbPeriod.style.display = 'block';
        if(mbReport) mbReport.style.display = 'block';
    }
}

// 2. 화면 전환
function showSection(id) {
    closeAllMobileMenus();  // ✅ 추가: 섹션 바뀌면 플로팅 메뉴 전부 닫기
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
    if (id === 'section-settlement-period' || id === 'section-settlement-staff') {initSettlementDates();}
    if (id === 'section-card-setup' || id === 'section-wired-setup') {initSetupDates();}
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
    
    // 5. 입력창 포커스 (개통 섹션은 예외: 스크롤 튐 방지)
    if (!['section-open','section-wired','section-used'].includes(id)) {
      const input = document.querySelector(`#${id} input`);
      if(input) input.focus();
    }

    if (id === 'section-db-view') {
    // 오늘 날짜 구하기
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const today = `${y}-${m}-${d}`;
    const first = `${y}-${m}-01`;

    document.getElementById('view_start').value = first;
    document.getElementById('view_end').value = today;
    }
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

    // ★ [추가] 상단 누적 현황도 로딩 표시 (이제 여기가 고정 높이라 로딩바 넣기 좋음)
    const dashMonth = document.getElementById('dash_month_stats');
    if(dashMonth) {
        dashMonth.innerHTML = `
            <div class="text-center w-100">
                <div class="spinner-border text-success mb-2"></div>
                <div class="small text-muted">집계 중...</div>
            </div>`;
    }
    
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
    
    // 2. 월간 누적 (디자인 수정: 폰트 축소, 구분선 제거)
    renderHtmlList('dash_month_stats', Object.keys(data.month), b => {
        const item = data.month[b];
        
        // ... (변수 선언부는 그대로) ...
        const tMobile = item.targetMobile || 1;
        const tWired = item.targetWired || 1;
        const mPct = item.pctMobile || 0;
        const wPct = item.pctWired || 0;
        const mReal = item.realPctMobile || 0;
        const wReal = item.realPctWired || 0;
        const mGoalText = item.targetMobile ? `목표 ${item.targetMobile}` : '미설정';
        const wGoalText = item.targetWired ? `목표 ${item.targetWired}` : '미설정';

        return `
        <div class="stat-item mb-4">
            
            <div class="d-flex align-items-center mb-1">
                <i class="bi bi-shop text-secondary me-2 small"></i>
                <span class="fw-bold text-dark small">${b}</span>
            </div>
            
            <div class="mb-1">
                <div class="d-flex justify-content-between align-items-center mb-0">
                    <div>
                        <span class="badge bg-primary me-1" style="font-size: 0.7rem;">무선</span>
                        <span class="fw-bold text-dark small">${item.mobile}건</span>
                    </div>
                    <div class="text-muted" style="font-size: 0.7rem;">
                        ${mGoalText} <span class="fw-bold text-primary">(${mReal}%)</span>
                    </div>
                </div>
                <div class="progress bg-light shadow-sm mt-1" style="height: 6px; border-radius: 3px;">
                    <div class="progress-bar bg-primary" role="progressbar" 
                         style="width: ${mPct}%; border-radius: 3px; transition: width 1s ease-in-out;" 
                         aria-valuenow="${mPct}" aria-valuemin="0" aria-valuemax="100">
                    </div>
                </div>
            </div>

            <div>
                <div class="d-flex justify-content-between align-items-center mb-0">
                    <div>
                        <span class="badge bg-success me-1" style="font-size: 0.7rem;">유선</span>
                        <span class="fw-bold text-dark small">${item.wired}건</span>
                    </div>
                    <div class="text-muted" style="font-size: 0.7rem;">
                        ${wGoalText} <span class="fw-bold text-success">(${wReal}%)</span>
                    </div>
                </div>
                <div class="progress bg-light shadow-sm mt-1" style="height: 6px; border-radius: 3px;">
                    <div class="progress-bar bg-success" role="progressbar" 
                         style="width: ${wPct}%; border-radius: 3px; transition: width 1s ease-in-out;" 
                         aria-valuenow="${wPct}" aria-valuemin="0" aria-valuemax="100">
                    </div>
                </div>
            </div>
        </div>
        `;
    }, '<div class="text-center text-muted py-5">데이터 없음</div>');
    
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
                        <th style="width:25%">💰</th> </tr>
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
                    <td class="fw-bold text-dark">${u.name}님</td>
                    <td class="text-muted">${u.mobile}</td>
                    <td class="text-muted">${u.wired}</td>
                    <td class="text-muted">${u.total}</td>
                    <td class="fw-bold text-danger">${marginStr}</td> </tr>
            `;
        });
        html += `</tbody></table>`;
        rankArea.innerHTML = html;
    }
}

// [수정] 초기 데이터 로드 (LocalStorage 캐싱 적용으로 속도 10배 향상)
function loadInitData() {
    // A. [로컬 스토리지] 캐시된 데이터가 있으면 먼저 화면에 뿌립니다 (0.1초 컷)
    const cachedVendors = localStorage.getItem('dbphone_vendors');
    const cachedIphone = localStorage.getItem('dbphone_iphone');
    
    if (cachedVendors) {
        globalVendorList = JSON.parse(cachedVendors);
        renderVendorDropdown(); // 즉시 렌더링
    }
    if (cachedIphone) {
        globalIphoneData = JSON.parse(cachedIphone);
    }

    // B. [서버 요청] 최신 데이터를 백그라운드에서 가져와서 캐시를 갱신합니다.
    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_vendors" }) })
    .then(r => r.json())
    .then(d => {
        globalVendorList = d.list.map(v => v.name);
        localStorage.setItem('dbphone_vendors', JSON.stringify(globalVendorList)); // ★ 캐시 저장
        renderVendorDropdown(); // 최신 데이터로 다시 렌더링
        if (document.getElementById('search_criteria').value === 'supplier') updateSearchUI();
    });

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_models" }) })
    .then(r => r.json())
    .then(d => {
        globalModelList = d.list;
        if (document.getElementById('search_criteria').value === 'model') updateSearchUI();
    });

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_iphone_data" }) })
    .then(r => r.json())
    .then(d => {
        globalIphoneData = d.data;
        localStorage.setItem('dbphone_iphone', JSON.stringify(d.data)); // ★ 캐시 저장
    });
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
    const vOpts = '<option value="" selected>선택하세요</option>' + (d.visitList || []).map(i=>`<option value="${i}">${i}</option>`).join('') + '<option value="기타">기타</option>';
    ['f_visit', 'w_visit', 'u_visit'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).innerHTML = vOpts; });
    const pList = d.payMethodList || []; const cList = d.colMethodList || [];
    ['f_pay1_m','f_pay2_m', 'w_pay1_m','w_pay2_m', 'u_pay1_m','u_pay2_m'].forEach(id => fill(id, pList));
    ['f_inc4_m','f_inc4_2_m','f_inc5_m', 'w_inc5_m', 'u_inc5_m'].forEach(id => fill(id, cList));
    globalAddonList = d.addonList || [];
}

// 5. 유틸리티
function checkVisitPath() { 
    const val = document.getElementById('f_visit').value;
    const div = document.getElementById('div_visit_etc');
    const input = document.getElementById('f_visit_etc');
    const label = document.getElementById('f_label_visit_etc'); // 라벨 가져오기

    // '기타' 또는 '고객소개'일 때 입력창 표시
    if (val === '고객소개' || val === '기타') {
        div.style.display = 'block';
        input.focus(); // 켜지면 바로 입력할 수 있게 포커스

        // 상황에 따라 라벨과 안내문구 변경
        if (val === '고객소개') {
            label.innerHTML = '소개자명<span class="required-star">*</span>';
            input.placeholder = "예: 한재민";
        } else {
            label.innerHTML = '기타<span class="required-star">*</span>';
            input.placeholder = "내용을 입력하세요";
        }
    } else {
        // 그 외에는 숨기고 값 비우기
        div.style.display = 'none';
        input.value = ''; 
    }
}   

function checkWiredVisitPath() { 
    const val = document.getElementById('w_visit').value; 
    const div = document.getElementById('w_div_visit_etc');
    const input = document.getElementById('w_visit_etc');
    const label = document.getElementById('w_label_visit_etc'); // 라벨 가져오기

    // '기타' 또는 '고객소개'일 때 입력창 표시
    if (val === '고객소개' || val === '기타') {
        div.style.display = 'block';
        input.focus(); // 켜지면 바로 입력할 수 있게 포커스

        // 상황에 따라 라벨과 안내문구 변경
        if (val === '고객소개') {
            label.innerHTML = '소개자명<span class="required-star">*</span>';
            input.placeholder = "예: 한재민";
        } else {
            label.innerHTML = '기타<span class="required-star">*</span>';
            input.placeholder = "내용을 입력하세요";
        }
    } else {
        // 그 외에는 숨기고 값 비우기
        div.style.display = 'none';
        input.value = ''; 
    }
}

function checkUsedVisitPath() { 
    const val = document.getElementById('u_visit').value; 
    const div = document.getElementById('u_div_visit_etc');
    const input = document.getElementById('u_visit_etc');
    const label = document.getElementById('u_label_visit_etc'); // 라벨 가져오기

    // '기타' 또는 '고객소개'일 때 입력창 표시
    if (val === '고객소개' || val === '기타') {
        div.style.display = 'block';
        input.focus(); // 켜지면 바로 입력할 수 있게 포커스

        // 상황에 따라 라벨과 안내문구 변경
        if (val === '고객소개') {
            label.innerHTML = '소개자명<span class="required-star">*</span>';
            input.placeholder = "예: 한재민";
        } else {
            label.innerHTML = '기타<span class="required-star">*</span>';
            input.placeholder = "내용을 입력하세요";
        }
    } else {
        // 그 외에는 숨기고 값 비우기
        div.style.display = 'none';
        input.value = ''; 
    }
}

// [수정] 리뷰 ID 토글 함수들 (안전한 버전)
function checkReviewId() { 
    const val = document.getElementById('f_review').value; 
    const div = document.getElementById('div_review_id');
    const el = document.getElementById('f_review_id');
    
    if(val === '작성') { div.style.display = 'block'; el.focus(); }
    else { div.style.display = 'none'; el.value = ''; }
}

function checkWiredReviewId() { 
    const val = document.getElementById('w_review').value; 
    const div = document.getElementById('w_div_review_id');
    const el = document.getElementById('w_review_id');

    if(val === '작성') { div.style.display = 'block'; el.focus(); }
    else { div.style.display = 'none'; el.value = ''; }
}

function checkUsedReviewId() { 
    const val = document.getElementById('u_review').value; 
    const div = document.getElementById('u_div_review_id');
    const el = document.getElementById('u_review_id');

    if(val === '작성') { div.style.display = 'block'; el.focus(); }
    else { div.style.display = 'none'; el.value = ''; }
}

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
    const areaBranch = document.getElementById('area-modal-branch');
    
    document.getElementById('reg_modal_barcode').value = dataObj.barcode || "";
    document.getElementById('reg_modal_serial').value = dataObj.serial || "";
    let defaultSup = document.getElementById('in_supplier').value || "지점미상";
    let defaultBranch = document.getElementById('in_branch').value || "장지 본점";

    tempInStockData = { type, barcode: dataObj.barcode, serial: dataObj.serial, supplier: defaultSup, branch: defaultBranch };

    if (type === 'simple_open') {
        // [간편 입고 모드]
        if (title) title.innerHTML = '<i class="bi bi-lightning-fill"></i> 간편 입고 (개통용)';
        if (areaBarcode) areaBarcode.style.display = 'none';
        if (areaBranch) {
            areaBranch.style.display = 'block'; 
            document.getElementById('reg_modal_branch').value = ""; // 초기화
        }
        
        // ★ [수정됨] 거래처 목록 로딩 로직 강화
        if (areaSupplier) {
            areaSupplier.style.display = 'block'; 
            const modalSupSel = document.getElementById('reg_modal_supplier');
            
            // 1. 이미 목록이 있으면 바로 그림
            if (globalVendorList && globalVendorList.length > 0) {
                modalSupSel.innerHTML = '<option value="">선택하세요</option>';
                globalVendorList.forEach(v => modalSupSel.innerHTML += `<option value="${v}">${v}</option>`);
                modalSupSel.value = ""; 
            } else {
                // 2. 목록이 없으면 "로딩 중" 표시 후 즉시 서버 요청
                modalSupSel.innerHTML = `<option value="" disabled selected>데이터 불러오는 중...</option>`;
                
                fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_vendors" }) })
                .then(r => r.json())
                .then(d => {
                    if(d.status === 'success') {
                        globalVendorList = d.list.map(v => v.name); // 전역 변수 업데이트
                        localStorage.setItem('dbphone_vendors', JSON.stringify(globalVendorList)); // 캐시 저장
                        
                        // 드롭다운 다시 그리기
                        modalSupSel.innerHTML = '<option value="">선택하세요</option>';
                        globalVendorList.forEach(v => modalSupSel.innerHTML += `<option value="${v}">${v}</option>`);
                    } else {
                        modalSupSel.innerHTML = `<option value="" disabled>로드 실패</option>`;
                    }
                })
                .catch(() => {
                    modalSupSel.innerHTML = `<option value="" disabled>통신 오류</option>`;
                });
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
        // [일반/아이폰 입고 모드] - 기존 코드 유지
        if (areaBarcode) areaBarcode.style.display = 'block'; 
        if (areaBranch) areaBranch.style.display = 'none';
        if (areaSupplier) areaSupplier.style.display = 'none'; 
        
        if (type === 'iphone') {
            if (title) title.innerHTML = '<i class="bi bi-apple"></i> 아이폰 정보 입력';
            if (msgText) msgText.style.display = 'none';
            if (areaIphone) areaIphone.style.display = 'block';
            if (areaManual) areaManual.style.display = 'none';
            
            // 아이폰 데이터가 아직 로드 안 됐을 경우 대비
            if (Object.keys(globalIphoneData).length === 0) {
                 fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_iphone_data" }) })
                 .then(r => r.json()).then(d => {
                     globalIphoneData = d.data;
                     updateIphoneColors(); // 데이터 로드 후 갱신
                 });
            }

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

// [최종 수정] 입력 완료 버튼 로직 (지점/거래처 선택 완벽 대응)
function submitStockRegister() {
    console.log("▶ 입력 완료 버튼 클릭됨");

    // 1. 버튼 포커스 해제 (에러 방지)
    const btn = document.getElementById('btn-stock-submit');
    if (btn) btn.blur(); 

    // 2. 데이터 유실 체크
    if (!tempInStockData) {
        alert("데이터가 유실되었습니다. 다시 스캔해주세요.");
        return;
    }

    // 3. 기본 변수 준비
    const type = tempInStockData.type;
    let supplier = tempInStockData.supplier; // 기본값
    let model = "";
    let color = "";
    
    // ★ [FIX] 아이폰 모드인지 판단
    const isIphoneMode = (document.getElementById('area-iphone').style.display !== 'none');

    // 4. [간편 입고]일 때만 지점/거래처 화면에서 읽어오기
    if (type === 'simple_open') {
        
        // (1) 지점 확인
        const branchEl = document.getElementById('reg_modal_branch');
        if (branchEl && branchEl.offsetParent !== null) { // 화면에 보인다면
            if (!branchEl.value) { 
                alert("입고할 지점을 선택해주세요!"); 
                branchEl.focus(); 
                return; // 중단
            }
            tempInStockData.branch = branchEl.value; // 데이터 갱신
        }

        // (2) 거래처 확인
        const supEl = document.getElementById('reg_modal_supplier');
        if (supEl && supEl.offsetParent !== null) { // 화면에 보인다면
            if (!supEl.value) { 
                alert("거래처를 선택해주세요!"); 
                supEl.focus(); 
                return; // 중단
            }
            // ★ [핵심] 여기서 변수들을 확실하게 업데이트
            tempInStockData.supplier = supEl.value; 
            supplier = supEl.value; 
        }
    }

    // 5. 모델명/색상 값 추출
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
        // 용량 선택 필수
        if (!mStorage) { alert("용량을 선택해주세요."); document.getElementById('reg_manual_storage').focus(); return; }
        if (!mColor) { alert("색상을 입력해주세요."); document.getElementById('reg_manual_color').focus(); return; }
        
        model = `${mModel}_${mStorage}`;
        color = mColor;
    }

    // 6. 최종 데이터 갱신
    tempInStockData.model = model;
    tempInStockData.color = color;
    tempInStockData.supplier = supplier; // ★ 갱신된 거래처 반영

    const modalEl = document.getElementById('modal-stock-register');
    const modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    
    // 7. 연속 스캔 모드 처리
    const toggleEl = document.getElementById('in_mode_toggle');
    if (toggleEl && toggleEl.checked) {
        inPendingList.push(tempInStockData);
        renderInList();
        
        // 포커스 에러 방지
        document.activeElement.blur();
        const mainInput = document.getElementById('in_scan');
        if(mainInput) mainInput.focus();
        
        modalInstance.hide();
        return; 
    }

    // 8. 서버 전송 시작 (버튼 비활성화)
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
            supplier: supplier, // ★ 여기서 갱신된 값을 보냄
            branch: tempInStockData.branch,
            user: currentUser
        })
    })
    .then(r => r.json())
    .then(d => {
        // 모달 닫기 안전 처리
        document.activeElement.blur();
        const mainInput = document.getElementById('in_scan');
        if(mainInput) mainInput.focus();
        modalInstance.hide();

        if(d.status === 'success') {
            if (type === 'simple_open') {
                alert("간편 입고 완료! 개통 정보를 입력합니다.");
                // 개통 화면으로 넘길 데이터 준비
                tempOpenStockData = {
                    inputCode: tempInStockData.serial,
                    model: model,
                    color: color,
                    serial: tempInStockData.serial,
                    branch: tempInStockData.branch,
                    supplier: supplier
                };
                // 개통 화면 UI 채우기
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
            }
        } else {
            alert("오류: " + d.message);
        }
    })
    .catch(err => {
        alert("통신 오류 발생: " + err);
    })
    .finally(() => {
        // 버튼 복구
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
    
    if (!validateField('f_act_type', '개통유형')) return; 
    if (!validateField('f_cont_type', '약정유형')) return; 
    if (!validateField('f_visit', '방문경로')) return; 
    if (!validateField('f_name', '고객명')) return; 
    if (!validateField('f_birth', '생년월일')) return; 
    if (!validateField('f_phone', '전화번호')) return; 
    if (!validateField('f_review', '리뷰작성여부')) return;
    let visitVal = document.getElementById('f_visit').value; if (visitVal === '고객소개' || visitVal === '기타') { const alertLabel = (visitVal === '고객소개') ? '소개자 이름' : '기타 방문경로'; if (!validateField('f_visit_etc', alertLabel)) return; visitVal = visitVal + ": " + document.getElementById('f_visit_etc').value; }
    let reviewId = document.getElementById('f_review').value; if (reviewId === '작성') { if (!validateField('f_review_id', '작성자 ID')) return; }
    btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> 저장 중...`; btn.disabled = true;
    const selectedAddons = []; document.querySelectorAll('#div_addon_container .addon-check:checked').forEach(cb => selectedAddons.push(cb.value));
    const formData = {
        action: "open_stock_full", stockInput: tempOpenStockData.inputCode, user: currentUser, activationType: document.getElementById('f_act_type').value, contractType: document.getElementById('f_cont_type').value, name: document.getElementById('f_name').value, birth: document.getElementById('f_birth').value, visitPath: visitVal, phoneNumber: document.getElementById('f_phone').value, pricePlan: document.getElementById('f_plan').value, changePlan: document.getElementById('f_plan_chg').value, selectedAddons: selectedAddons, usim: document.getElementById('f_usim').value, card: document.getElementById('f_card').value, review: document.getElementById('f_review').value, reviewId: document.getElementById('f_review_id').value, aValue: document.getElementById('f_avalue').value, policy: document.getElementById('f_policy').value,
        income1: document.getElementById('f_inc1').value, income1Memo: document.getElementById('f_inc1_m').value, income2: document.getElementById('f_inc2').value, income2Memo: document.getElementById('f_inc2_m').value, income3: document.getElementById('f_inc3').value, income3Memo: document.getElementById('f_inc3_m').value, cost1: document.getElementById('f_cost1').value, cost1Memo: document.getElementById('f_cost1_m').value, cost2: document.getElementById('f_cost2').value,
        payment1: document.getElementById('f_pay1').value, payment1Method: document.getElementById('f_pay1_m').value, payment1Date: document.getElementById('f_pay1_d').value, payment1Memo: document.getElementById('f_pay1_memo').value, payment2: document.getElementById('f_pay2').value, payment2Method: document.getElementById('f_pay2_m').value, payment2Date: document.getElementById('f_pay2_d').value, payment2Memo: document.getElementById('f_pay2_memo').value, cash: document.getElementById('f_cash').value, payback1: document.getElementById('f_back').value, bankName: document.getElementById('f_bank').value, accountNumber: document.getElementById('f_acc').value, depositor: document.getElementById('f_holder').value,
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
// [script.js 수정] 유선 개통 요금제 입력칸 그리기 (변경요금제 추가 + 1줄 배치)
function renderWiredPlanInputs(contractType) {
    const area = document.getElementById('w_plan_input_area'); 
    area.innerHTML = "";
    
    if(contractType === "인터넷+TV+기타서비스") { 
        // ★ 요청사항: 4개 항목을 한 줄에 배치 (12 / 4 = col-3)
        area.innerHTML = `
        <div class="row g-2">
            <div class="col-3">
                <label class="form-label-sm">인터넷요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_net">
            </div>
            <div class="col-3">
                <label class="form-label-sm">TV요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_tv">
            </div>
            <div class="col-3">
                <label class="form-label-sm">기타서비스</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_other">
            </div>
            <div class="col-3">
                <label class="form-label-sm">변경요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_chg">
            </div>
        </div>`; 
    } 
    else if(contractType === "인터넷+TV") { 
        // 3개 항목 (인터넷, TV, 변경요금제) -> 한 줄에 배치 (12 / 3 = col-4)
        area.innerHTML = `
        <div class="row g-2">
            <div class="col-4">
                <label class="form-label-sm">인터넷요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_net">
            </div>
            <div class="col-4">
                <label class="form-label-sm">TV요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_tv">
            </div>
            <div class="col-4">
                <label class="form-label-sm">변경요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_chg">
            </div>
        </div>`; 
    } 
    else { 
        // 2개 항목 (인터넷, 변경요금제) -> 한 줄에 배치 (12 / 2 = col-6)
        area.innerHTML = `
        <div class="row g-2">
            <div class="col-6">
                <label class="form-label-sm">인터넷요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_net">
            </div>
            <div class="col-6">
                <label class="form-label-sm">변경요금제</label>
                <input type="text" class="form-control form-control-sm" id="w_plan_chg">
            </div>
        </div>`; 
    }
}
function resetWiredForm() {
    document.getElementById('wired_branch').selectedIndex = 0; document.getElementById('w_pre_avalue').selectedIndex = 0; document.getElementById('w_pre_act_type').selectedIndex = 0; document.getElementById('w_pre_cont_type').selectedIndex = 0;
    document.getElementById('wired_step_1').style.display = 'block'; document.getElementById('wired_step_2').style.display = 'none';
    document.querySelectorAll('#wired_step_2 input').forEach(i => i.value = ""); document.querySelectorAll('#wired_step_2 select').forEach(s => s.selectedIndex=0);
    document.getElementById('w_div_visit_etc').style.display = 'none';
    setTimeout(() => { const firstInput = document.querySelector('#wired_step_1 select'); if(firstInput) firstInput.focus(); }, 100);
}
function submitWiredContract(event) {
    if (!validateField('w_act_type', '개통유형')) return; 
    if (!validateField('w_cont_type', '약정유형')) return; 
    if (!validateField('w_visit', '방문경로')) return; 
    if (!validateField('w_name', '고객명')) return; 
    if (!validateField('w_birth', '생년월일')) return; 
    if (!validateField('w_phone', '전화번호')) return; 
    if (!validateField('w_review', '리뷰작성여부')) return;
    let visitVal = document.getElementById('w_visit').value; if (visitVal === '고객소개' || visitVal === '기타') { const alertLabel = (visitVal === '고객소개') ? '소개자 이름' : '기타 방문경로'; if (!validateField('w_visit_etc', alertLabel)) return; visitVal = visitVal + ": " + document.getElementById('w_visit_etc').value; }
    let reviewId = document.getElementById('w_review').value; if (reviewId === '작성') { if (!validateField('w_review_id', '작성자 ID')) return; }
    const parts = []; ['w_plan_net','w_plan_tv','w_plan_other'].forEach(id => { const el=document.getElementById(id); if(el && el.value) parts.push(el.value); });
    const pricePlan = parts.join(" / ");
    const formData = {
        action: "open_wired_full", user: currentUser, branch: document.getElementById('wired_branch').value, activationType: document.getElementById('w_act_type').value, contractType: document.getElementById('w_cont_type').value, name: document.getElementById('w_name').value, birth: document.getElementById('w_birth').value, visitPath: visitVal, phoneNumber: document.getElementById('w_phone').value, pricePlan: pricePlan, changePlan: document.getElementById('w_plan_chg').value, card: document.getElementById('w_card').value, review: document.getElementById('w_review').value, reviewId: document.getElementById('w_review_id').value, aValue: document.getElementById('w_avalue').value, policy: document.getElementById('w_policy').value,
        income1: document.getElementById('w_inc1').value, income1Memo: document.getElementById('w_inc1_m').value, income2: document.getElementById('w_inc2').value, income2Memo: document.getElementById('w_inc2_m').value, income3: document.getElementById('w_inc3').value, income3Memo: document.getElementById('w_inc3_m').value, cost1: document.getElementById('w_cost1').value, cost1Memo: document.getElementById('w_cost1_m').value, cost2: "", 
        payment1: document.getElementById('w_pay1').value, payment1Method: document.getElementById('w_pay1_m').value, payment1Date: document.getElementById('w_pay1_d').value, payment1Memo: document.getElementById('w_pay1_memo').value, payment2: document.getElementById('w_pay2').value, payment2Method: document.getElementById('w_pay2_m').value, payment2Date: document.getElementById('w_pay2_d').value, payment2Memo: document.getElementById('w_pay2_memo').value, cash: document.getElementById('w_cash').value, payback1: document.getElementById('w_back').value, bankName: document.getElementById('w_bank').value, accountNumber: document.getElementById('w_acc').value, depositor: document.getElementById('w_holder').value,
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
    if (!validateField('u_act_type', '개통유형')) return; 
    if (!validateField('u_cont_type', '약정유형')) return; 
    if (!validateField('u_visit', '방문경로')) return; 
    if (!validateField('u_name', '고객명')) return; 
    if (!validateField('u_birth', '생년월일')) return; 
    if (!validateField('u_phone', '전화번호')) return; 
    if (!validateField('u_review', '리뷰작성여부')) return;
    let visitVal = document.getElementById('u_visit').value; if (visitVal === '고객소개' || visitVal === '기타') { const alertLabel = (visitVal === '고객소개') ? '소개자 이름' : '기타 방문경로'; if (!validateField('u_visit_etc', alertLabel)) return; visitVal = visitVal + ": " + document.getElementById('u_visit_etc').value; }
    let reviewId = document.getElementById('u_review').value; if (reviewId === '작성') { if (!validateField('u_review_id', '작성자 ID')) return; }
    const selectedAddons = []; document.querySelectorAll('#u_div_addon_container .addon-check:checked').forEach(cb => selectedAddons.push(cb.value));
    const formData = {
        action: "open_used_full", user: currentUser, branch: document.getElementById('u_branch').value, activationType: document.getElementById('u_act_type').value, contractType: document.getElementById('u_cont_type').value, name: document.getElementById('u_name').value, birth: document.getElementById('u_birth').value, visitPath: visitVal, phoneNumber: document.getElementById('u_phone').value, pricePlan: document.getElementById('u_plan').value, changePlan: document.getElementById('u_plan_chg').value, selectedAddons: selectedAddons, usim: document.getElementById('u_usim').value, card: document.getElementById('u_card').value, review: document.getElementById('u_review').value, reviewId: document.getElementById('u_review_id').value, aValue: document.getElementById('u_avalue').value, policy: document.getElementById('u_policy').value, model: document.getElementById('u_model').value, serial: document.getElementById('u_serial').value,
        income1: document.getElementById('u_inc1').value, income1Memo: document.getElementById('u_inc1_m').value, income2: document.getElementById('u_inc2').value, income2Memo: document.getElementById('u_inc2_m').value, income3: document.getElementById('u_inc3').value, income3Memo: document.getElementById('u_inc3_m').value, cost1: document.getElementById('u_cost1').value, cost1Memo: document.getElementById('u_cost1_m').value, cost2: "", 
        payment1: document.getElementById('u_pay1').value, payment1Method: document.getElementById('u_pay1_m').value, payment1Date: document.getElementById('u_pay1_d').value, payment1Memo: document.getElementById('u_pay1_memo').value, payment2: document.getElementById('u_pay2').value, payment2Method: document.getElementById('u_pay2_m').value, payment2Date: document.getElementById('u_pay2_d').value, payment2Memo: document.getElementById('u_pay2_memo').value, cash: "", payback1: "", bankName: "", accountNumber: "", depositor: "", income4_1: "", income4_2: "",
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
        
        // [캐시 동기화 로직]
        if (n && !globalVendorList.includes(n)) {
            globalVendorList.push(n); // 1. 전역 변수 업데이트
            
            // ★ [추가된 부분] 로컬 스토리지도 즉시 업데이트!
            localStorage.setItem('dbphone_vendors', JSON.stringify(globalVendorList)); 
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

// [script.js] 모든 모바일 메뉴 닫기 (수정됨: excludeId 적용)
function closeAllMobileMenus(excludeId) {
  const ids = ["fab-menu-container", "search-menu-container", "manage-menu-container", "stats-menu-container"];
  ids.forEach(id => {
    // ★ 여기가 핵심입니다. 지금 누른 메뉴는 닫지 않고 건너뜀
    if (id === excludeId) return; 

    const el = document.getElementById(id);
    if(!el) return;

    el.classList.remove("open");
    setTimeout(() => {
        // 타이머가 돌 때, 혹시 그 사이에 다시 열렸는지 확인
        if (!el.classList.contains("open")) {
            el.classList.add("d-none");
        }
    }, 160);
  });

  if (!excludeId) setOverlay(false);
}

function anyMobileMenuOpen() {
  const ids = ["fab-menu-container", "search-menu-container", "manage-menu-container", "stats-menu-container"];
  return ids.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("d-none") && el.classList.contains("open");
  });
}

function setOverlay(open) {
  const overlay = document.getElementById("fab-menu-overlay");
  if (!overlay) return;

  overlay.classList.toggle("d-none", !open);
  document.body.classList.toggle("no-scroll", open);
}

// [script.js] Fab 메뉴 토글 (수정됨: ID 넘겨주기)
function toggleFabMenu(){
  const menu = document.getElementById("fab-menu-container");
  if(!menu) return;
  const isOpen = menu.classList.contains("open");

  // ★ 나 빼고 다 닫아라!
  closeAllMobileMenus("fab-menu-container");

  if(!isOpen){
    menu.classList.remove("d-none");
    requestAnimationFrame(() => menu.classList.add("open"));
    setOverlay(true);
  } else {
    menu.classList.remove("open");
    setTimeout(() => menu.classList.add("d-none"), 160);
    setOverlay(false);
  }
}

function toggleSearchMenu() {
  closeAllMobileMenus("search-menu-container");
  const menu = document.getElementById("search-menu-container");
  if (!menu) return;

  const willOpen = menu.classList.contains("d-none");
  if (willOpen) {
    menu.classList.remove("d-none");
    requestAnimationFrame(() => menu.classList.add("open"));
  } else {
    menu.classList.remove("open");
    setTimeout(() => menu.classList.add("d-none"), 160);
  }
  setOverlay(willOpen);
}

function toggleManageMenu() {
  closeAllMobileMenus("manage-menu-container");
  const menu = document.getElementById("manage-menu-container");
  if (!menu) return;

  const willOpen = menu.classList.contains("d-none");
  if (willOpen) {
    menu.classList.remove("d-none");
    requestAnimationFrame(() => menu.classList.add("open"));
  } else {
    menu.classList.remove("open");
    setTimeout(() => menu.classList.add("d-none"), 160);
  }
  setOverlay(willOpen);
}

function toggleStatsMenu() {
  closeAllMobileMenus("stats-menu-container");
  const menu = document.getElementById("stats-menu-container");
  if (!menu) return;

  const willOpen = menu.classList.contains("d-none");
  if (willOpen) {
    menu.classList.remove("d-none");
    requestAnimationFrame(() => menu.classList.add("open"));
  } else {
    menu.classList.remove("open");
    setTimeout(() => menu.classList.add("d-none"), 160);
  }
  setOverlay(willOpen);
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
                const contact = item['전화번호'] || '-';
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
        const dateKeys = ['요금제변경일', '부가서비스해지일', '대납1처리일', '대납2처리일', '처리일', '개통일'];
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
                                ${item['전화번호'] || '-'} <span class="text-muted mx-1">|</span>
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
            ${makeInput('전화번호', '전화번호', 'col-4')}

            ${makeInput('요금제', '요금제', 'col-4')}
            ${makeInput('변경요금제', '변경요금제', 'col-4')}
            ${makeInput('요금제변경일', '요금제변경일', 'col-4', 'text', false, true)}

            ${makeInput('부가서비스', '부가서비스', 'col-8')}
            ${makeInput('부가서비스해지일', '부가서비스해지일', 'col-4', 'text', false, true)}

            ${makeInput('제휴카드', '제휴카드', 'col-6')}
            ${makeSelect('리뷰작성여부', '리뷰작성여부', reviewList, 'col-6')}
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
            
            ${makeInput('기본정책', '기본정책', 'col-6', 'number')}
            ${makeInput('메모', '기본정책메모', 'col-6')}
            
            ${makeInput('추가정책', '추가정책', 'col-6', 'number')}
            ${makeInput('메모', '추가정책메모', 'col-6')}
            
            ${makeInput('부가정책', '부가정책', 'col-6', 'number')}
            ${makeInput('메모', '부가정책메모', 'col-6')}
            
            ${makeInput('차감정책', '차감정책', 'col-6', 'number', true)}
            ${makeInput('메모', '차감정책메모', 'col-6')}
            
            ${makeInput('프리할인', '프리할인', 'col-6', 'number', true)}
            ${makeSelect('유심', '유심', usimList, 'col-6')}
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
            ${makeSelect('결제', '대납1결제', payMethodList, 'col-4')}
            ${makeInput('처리일', '대납1처리일', 'col-4', 'date')}
            ${makeInput('사유', '대납1사유', 'col-12')}
            
            ${makeInput('대납2', '대납2', 'col-4', 'number', true)}
            ${makeSelect('결제', '대납2결제', payMethodList, 'col-4')}
            ${makeInput('처리일', '대납2처리일', 'col-4', 'date')}
            ${makeInput('사유', '대납2사유', 'col-12')}
            
            ${makeInput('캐시백', '캐시백', 'col-6', 'number', true)}
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
    // ★ [핵심] 유선이면 '상품권/기타', 무선이면 '중고폰'으로 이름표 변경
    // 기본값 (무선/중고폰)
    let labelSpecial = '중고폰';
    let keySpecial = '중고폰';
    let keyMemo = '중고폰메모';

    // 유선개통일 경우 (상품권으로 변경)
    if (item.sheetName === '유선개통') {
        labelSpecial = '상품권/기타';
        keySpecial = '상품권';         // ★ 핵심: 상품권 값을 가져오도록 변경
        keyMemo = '상품권메모';        // ★ 핵심: 상품권 메모를 가져오도록 변경
    }
    
    let sectionCollect = `
        <div class="divider"></div>
        <div class="section-header"><i class="bi bi-wallet2"></i> 수납 상세</div>
        <div class="row g-2">
            ${makeInput('단말기수납1', '기기대1', 'col-6', 'number')}
            ${makeSelect('결제', '기기대1결제', colMethodList, 'col-6')}

            ${makeInput('단말기수납2', '기기대2', 'col-6', 'number')}
            ${makeSelect('결제', '기기대2결제', colMethodList, 'col-6')}
            
            ${makeInput('요금수납', '요금', 'col-6', 'number')}
            ${makeSelect('결제', '요금결제', colMethodList, 'col-6')}
            
            ${makeInput(labelSpecial, keySpecial, 'col-6', 'number')}
            ${makeInput('메모', keyMemo, 'col-6')}
            
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
            if (key === '리뷰작성여부') {
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
            if (activeSection && activeSection.id === 'section-search-all') {
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
        body: JSON.stringify({ 
            action: "get_all_history", 
            start: start, 
            end: end, 
            keyword: keyword, 
            branch: branch,
            specialType: type  // ★ 핵심: 이 꼬리표를 달아줘야 서버가 "아! 필터링해야지" 하고 알아듣습니다.
        })
    })
    .then(r => r.json())
    .then(res => {
      const list = res.data || res.list || [];   // 어떤 형태든 흡수
      if (res.status === 'success' && list.length > 0) {
        container.innerHTML = list.map(item => renderSpecialCard(item, type)).join('');
      } else {
        container.innerHTML = '<div class="text-center text-muted py-5 small">미처리 내역이 없습니다. (모두 완료됨)</div>';
      }
    })

    .catch(err => {
        console.error(err);
        container.innerHTML = '<div class="text-center text-danger py-5 small">오류 발생</div>';
    });
}

// 2. 카드 렌더링 (체크값 기준 배지 표시)
function renderSpecialCard(item, type) {
    // ★ [수정 1] 타입에 맞춰서 올바른 금액 키('중고폰' vs '상품권')를 가져옴
    const targetKey = (type === 'usedphone') ? '중고폰' : '상품권';
    const amountVal = item[targetKey] || 0;
    
    // 체크 여부 (백엔드에서 계산된 값 사용)
    const isChecked = item.completed === true;
    
    let statusBadge = '';
    if (isChecked) {
        const label = (type === 'usedphone') ? '반납완료' : '수령완료';
        statusBadge = `<span class="badge bg-success rounded-pill px-4 py-2 fs-6 shadow-sm"><i class="bi bi-check-lg me-1"></i>${label}</span>`;
    } else {
        const label = (type === 'usedphone') ? '미반납' : '미수령';
        statusBadge = `<span class="badge bg-danger bg-opacity-75 rounded-pill px-4 py-2 fs-6 shadow-sm animate__animated animate__pulse animate__infinite">${label}</span>`;
    }

    let typeBadgeClass = 'bg-primary';
    if(item.sheetName === '유선개통') typeBadgeClass = 'bg-success';
    else if(item.sheetName === '중고개통') typeBadgeClass = 'bg-warning text-dark';

    const itemStr = JSON.stringify(item).replace(/"/g, '&quot;');

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
                    ${item['전화번호']} <span class="text-muted mx-1">|</span>
                    ${item['개통처']} <span class="text-muted mx-1">|</span>
                    ${item['개통유형']}
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

// 3. 모달 열기 (데이터 바인딩 로직 개선)
function openSpecialModal(item, type) {
    document.getElementById('sp_sheetName').value = item.sheetName;
    document.getElementById('sp_rowIndex').value = item.rowIndex;
    document.getElementById('sp_branch').value = item.branch;
    document.getElementById('sp_type').value = type;

    document.getElementById('sp_customer_name').innerText = item['고객명'];
    document.getElementById('sp_customer_info').innerText = `${item['전화번호']} | ${item['개통일']}`;

    const amtLabel = document.getElementById('sp_amt_label');
    const modalTitle = document.getElementById('special-modal-title');
    const modelGroup = document.getElementById('sp_model_group');
    const checkLabel = document.getElementById('sp_check_label');

    if (type === 'usedphone') {
        modalTitle.innerText = "중고폰 반납 등록";
        amtLabel.innerText = "정산 금액 (반납 금액)";
        checkLabel.innerText = " 반납 확인 (체크 시 정산 반영)";
        modelGroup.style.display = 'block'; 
    } else {
        modalTitle.innerText = "상품권 수령 등록";
        amtLabel.innerText = "정산 금액 (수령 금액)";
        checkLabel.innerText = " 수령 확인 (체크 시 정산 반영)";
        modelGroup.style.display = 'none'; 
    }

    // 1. 금액 세팅
    const existingAmount = (type === 'usedphone')
      ? (item['중고폰'] ?? '')
      : (item['상품권'] ?? '');

    document.getElementById('sp_amount').value = existingAmount ? Number(String(existingAmount).replace(/,/g,'')).toLocaleString() : '';
    
    // 2. 체크 상태 세팅
    document.getElementById('sp_checkbox').checked = (item.completed === true);

    // 3. 모델명 & 날짜 세팅 (분리된 로직)
    // - item['checkDate']: AV/AX 메모에 저장된 날짜 (체크 날짜)
    // - item['중고폰메모']: AU/AW 메모에 저장된 모델명
    
    let savedDate = item['checkDate'] || ''; // 체크칸 메모에서 날짜 가져옴
    let savedModel = item['중고폰메모'] || ''; // 금액칸 메모에서 모델명 가져옴

    // (호환성 유지) 만약 체크칸 메모(날짜)가 없으면, 예전 방식(모델/날짜 섞인 텍스트)에서 추출 시도
    if (!savedDate && savedModel.includes('-')) {
        savedDate = savedModel.substring(0, 10);
    }
    // 모델명 정제 (날짜나 슬래시 제거하고 순수 모델명만 남기기 시도)
    if (savedModel.includes('/')) {
        let parts = savedModel.split('/');
        if (parts.length > 1) savedModel = parts[1].replace(' 반납', '').trim();
    }

    document.getElementById('sp_date').value = savedDate || new Date().toISOString().split('T')[0];
    document.getElementById('sp_model_name').value = savedModel;

    new bootstrap.Modal(document.getElementById('modal-special-update')).show();
}

// 4. 저장하기 (모델명과 날짜를 분리해서 전송)
function submitSpecialUpdate() {
    const type = document.getElementById('sp_type').value;
    const amountStr = document.getElementById('sp_amount').value;
    const dateVal = document.getElementById('sp_date').value;
    const modelVal = document.getElementById('sp_model_name').value;
    const isChecked = document.getElementById('sp_checkbox').checked;
    
    // ★ 핵심: 모델명은 모델명대로, 날짜는 날짜대로 따로 보냄
    const modelMemo = (type === 'usedphone') ? modelVal.trim() : ""; // AU/AW에 저장될 모델명
    
    const formData = {
        action: "update_history",
        branch: document.getElementById('sp_branch').value,
        rowIndex: document.getElementById('sp_rowIndex').value,
        specialType: type,
        
        amount: amountStr, 
        
        // 1. 모델명 (AU/AW 열의 메모로 저장됨)
        modelMemo: modelMemo, 
        
        // 2. 체크 상태 (AV/AX 열의 값으로 저장됨)
        isChecked: isChecked,
        
        // 3. 날짜 (AV/AX 열의 메모로 저장됨 - 체크된 경우만)
        checkDate: dateVal 
    };

    Swal.fire({ title: '저장 중...', didOpen: () => Swal.showLoading() });

    fetch(GAS_URL, { method: "POST", body: JSON.stringify(formData) })
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

// [script.js] 체크박스 클릭 시 날짜 팝업 -> 확인 시 즉시 저장
function toggleCheckDate() {
    const chk = document.getElementById('sp_checkbox');
    const dateInput = document.getElementById('sp_date');
    const type = document.getElementById('sp_type').value; // 'usedphone' or 'gift'
    
    // 1. 팝업 제목 결정
    const titleText = (type === 'usedphone') ? '반납일' : '수령일';

    if (chk.checked) {
        // [체크 ON] -> 날짜 선택 팝업 띄우기
        Swal.fire({
            title: titleText, // "반납일" or "수령일"
            html: `<input type="date" id="swal-date" class="form-control form-control-lg text-center fw-bold" value="${dateInput.value}">`,
            showCancelButton: true,
            confirmButtonText: '확인',
            cancelButtonText: '취소',
            preConfirm: () => {
                return document.getElementById('swal-date').value;
            }
        }).then((result) => {
            if (result.isConfirmed && result.value) {
                // [확인] 선택한 날짜 반영 후 -> 즉시 저장!
                dateInput.value = result.value;
                submitSpecialUpdate(); // ★ 바로 저장 함수 호출
            } else {
                // [취소] 체크박스 다시 끄기
                chk.checked = false;
            }
        });
    } else {
        // [체크 OFF] -> 즉시 저장 (서버에서 날짜 삭제됨)
        submitSpecialUpdate(); // ★ 바로 저장 함수 호출
    }
}

// [script.js 수정] 정산 관리 시스템 (날짜 자동화 + 거래처별 집계)

// 1. 날짜 초기화 (이번 달 1일 ~ 말일)
function initSettlementDates() {
    const today = new Date();
    // 이번 달 1일
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    // 이번 달 말일 (다음 달 0일)
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    const fmt = d => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };
    
    // 기간별 화면
    if(document.getElementById('sp_start')) document.getElementById('sp_start').value = fmt(firstDay);
    if(document.getElementById('sp_end')) document.getElementById('sp_end').value = fmt(lastDay);
    
    // 직원별 화면
    if(document.getElementById('ss_start')) document.getElementById('ss_start').value = fmt(firstDay);
    if(document.getElementById('ss_end')) document.getElementById('ss_end').value = fmt(lastDay);
}

// 2. 데이터 조회
async function loadSettlement(type) {
    let start, end, viewType = 'branch';
    
    if (type === 'period') {
        start = document.getElementById('sp_start').value;
        end = document.getElementById('sp_end').value;
        viewType = document.getElementById('sp_view_type').value;

        // [초기화] 기존 데이터 및 합계 줄 삭제
        document.getElementById('sp_tbody').innerHTML = `
            <tr style="height: 450px;">
                <td colspan="8" class="align-middle">
                    <div class="spinner-border text-primary mb-2" style="width: 3rem; height: 3rem;"></div>
                    <div class="text-muted fw-bold mt-2">데이터를 불러오는 중입니다...</div>
                </td>
            </tr>
        `;
        document.getElementById('sp_tfoot').innerHTML = ''; // 잔상 제거
    } else {
        // 직원별 조회
        start = document.getElementById('ss_start').value;
        end = document.getElementById('ss_end').value;
        
        // [초기화] 기존 데이터 및 합계 줄 삭제 (★ 여기 추가됨)
        document.getElementById('ss_tbody').innerHTML = `
            <tr style="height: 450px;">
                <td colspan="7" class="align-middle">
                    <div class="spinner-border text-success mb-2" style="width: 3rem; height: 3rem;"></div>
                    <div class="text-muted fw-bold mt-2">데이터를 불러오는 중입니다...</div>
                </td>
            </tr>
        `;
        // ★ [핵심] 조회 버튼 누르자마자 하단 합계 줄 삭제 -> 잔상 해결
        const tfoot = document.getElementById('ss_tfoot');
        if (tfoot) tfoot.innerHTML = ''; 
    }

    try {
        const userSession = JSON.parse(sessionStorage.getItem('dbphone_user'));
        const myEmail = userSession ? userSession.email : "";
        
        // 타임아웃 5분(300000ms) 설정된 requestAPI 호출
        const d = await requestAPI({
            action: "get_settlement_report",
            userEmail: myEmail, 
            userName: currentUser, 
            startDate: start,
            endDate: end,
            viewType: viewType
        });

        if (d.status === 'success') {
            if (type === 'period') renderPeriodStats(d);
            else renderStaffStats(d);
        } else {
            // 에러 표시
            const colspan = type === 'period' ? 8 : 7;
            const targetId = type === 'period' ? 'sp_tbody' : 'ss_tbody';
            const targetEl = document.getElementById(targetId);
            if(targetEl) {
                targetEl.innerHTML = `
                    <tr style="height: 450px;">
                        <td colspan="${colspan}" class="text-danger align-middle fw-bold">
                            <i class="bi bi-exclamation-triangle fs-1 d-block mb-3"></i>
                            ${d.message}
                        </td>
                    </tr>`;
            }
        }
    } catch (e) {
        console.error(e);
        const colspan = type === 'period' ? 8 : 7;
        const targetId = type === 'period' ? 'sp_tbody' : 'ss_tbody';
        const targetEl = document.getElementById(targetId);
        if(targetEl) {
            targetEl.innerHTML = `
                <tr style="height: 450px;">
                    <td colspan="${colspan}" class="text-danger align-middle fw-bold">
                        통신 오류가 발생했습니다.
                    </td>
                </tr>`;
        }
    }
}

// ==========================================
// [신규] 일일 보고
// ==========================================
// 1. 화면 전환 및 초기화
function showDailyReportSection() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    
    const dateInput = document.getElementById('dr_date');
    if(dateInput && !dateInput.value) {
        dateInput.value = `${yyyy}-${mm}-${dd}`; // 오늘 날짜 자동 세팅
    }
    
    showSection('section-daily-report');
    loadDailyReport(); // 자동 조회
}

// ==========================================
// [설정] 일일 보고 테이블 컬럼 정의
// ==========================================
const REPORT_COLUMNS = [
    { label: "지점",    key: "branch",  width: "80px" },
    { label: "방문경로", key: "visit",   width: "80px",  formatter: (v) => `<span class="text-truncate d-block" style="max-width:80px">${v}</span>` },
    { label: "개통처",  key: "carrier", width: "80px" },
    { label: "유형",    key: "type",    width: "80px",  formatter: (v) => getTypeBadge(v) },
    { label: "고객명",  key: "name",    width: "80px",  className: "fw-bold" },
    { label: "담당자",  key: "manager", width: "80px" },
    { label: "정산",    key: "settle",  width: "100px", className: "table-primary bg-opacity-10 text-primary fw-bold text-end", formatter: (v) => fmt(v) },
    { label: "대납",    key: "support", width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "캐시백",  key: "cash",    width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "페이백",  key: "payback", width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "기기대",  key: "device",  width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "요금",    key: "fee",     width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "중고폰",  key: "used",    width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "상품권",  key: "gift",    width: "70px",  className: "text-end text-secondary", formatter: (v) => fmtMoney(v) },
    { label: "매출",    key: "revenue", width: "100px", className: "table-success bg-opacity-10 text-success fw-bold text-end", formatter: (v) => fmt(v) },
    { label: "마진",    key: "margin",  width: "100px", className: "table-danger bg-opacity-10 text-danger fw-bold text-end", formatter: (v) => fmt(v) },
    { label: "리뷰",    key: "review",  width: "50px",  formatter: (v) => getReviewIcon(v) }
];

// [도구] 포맷팅 헬퍼 함수
const fmt = (n) => Number(n).toLocaleString();
const fmtMoney = (n) => n === 0 ? '<span class="text-muted opacity-25">-</span>' : fmt(n);
const getReviewIcon = (v) => (v === 'true' || v === true) ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<span class="text-muted opacity-25">-</span>';
function getTypeBadge(t) {
    let c = "bg-secondary";
    if (t.includes("신규")||t.includes("이동")||t.includes("기변")) c="bg-primary";
    else if (t.includes("중고")) c="bg-warning text-dark";
    else if (t.includes("유선")||t.includes("인터넷")) c="bg-success";
    return `<span class="badge ${c} bg-opacity-75">${t}</span>`;
}

// [실행] 일일 보고 조회 (헤더 초기화 추가)
function loadDailyReport() {
    const branch = document.getElementById('dr_branch').value;
    const date = document.getElementById('dr_date').value;
    if(!date) { alert("날짜를 선택해주세요."); return; }

    const headerRow = document.getElementById('dr_header_row');
    const tbody = document.getElementById('dr_tbody');
    
    if(tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-center align-middle py-5"><div class="spinner-border text-primary"></div><div class="mt-2 small text-muted">로딩 중...</div></td></tr>`;
    if(headerRow) headerRow.innerHTML = ""; // ★ 헤더 비우기

    fetch(GAS_URL, { method: "POST", body: JSON.stringify({ action: "get_daily_report_detail", branch, date }) })
    .then(r => r.json()).then(d => {
        if(d.status === 'success') renderDailyReportTable(d.list, d.summary);
        else if(tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-danger text-center py-4">${d.message}</td></tr>`;
    }).catch(e => {
        if(tbody) tbody.innerHTML = `<tr><td colspan="100%" class="text-danger text-center py-4">통신 오류</td></tr>`;
    });
}

// [실행] 일일 보고 렌더링 (리팩토링 버전)
function renderDailyReportTable(list, summary) {
    const headerRow = document.getElementById('dr_header_row');
    const tbody = document.getElementById('dr_tbody');

    document.getElementById('dr_sum_total').innerText = summary.total + "건";
    document.getElementById('dr_sum_detail').innerText = `(📱${summary.mobile} / 📺${summary.wired} / ♻️${summary.used})`;
    document.getElementById('dr_sum_settle').innerText = fmt(summary.settle);
    document.getElementById('dr_sum_revenue').innerText = fmt(summary.revenue);
    document.getElementById('dr_sum_margin').innerText = fmt(summary.margin);

    if (headerRow) {
        headerRow.innerHTML = REPORT_COLUMNS.map(col => {
            const style = col.width ? `style="min-width:${col.width}; width:${col.width}"` : "";
            const cls = (col.className || "").replace(/text-(end|start|center)/g, "").replace("fw-bold", ""); 
            return `<th ${style} class="${cls}">${col.label}</th>`;
        }).join('');
    }

    if (list.length === 0) {
        if(tbody) tbody.innerHTML = `<tr><td colspan="${REPORT_COLUMNS.length}" class="text-muted py-5 text-center">내역이 없습니다.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(item => {
        const tds = REPORT_COLUMNS.map(col => {
            const raw = item[col.key]; 
            const val = col.formatter ? col.formatter(raw) : (raw || "");
            return `<td class="${col.className || ""}">${val}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
    }).join('');
}

// ==========================================
// [신규] 일별 매출/추이 분석 (기존 스타일 준수)
// ==========================================

let dailySalesChartInstance = null; // 차트 중복 생성 방지용

function showDailySalesSection() {
    // 1. 날짜 기본값 세팅 (이번 달)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    
    const monthInput = document.getElementById('ds_month');
    if(monthInput && !monthInput.value) {
        monthInput.value = `${yyyy}-${mm}`;
    }
    
    // 2. 섹션 이동 (기존 함수 사용)
    showSection('section-daily-sales');
    
    // 3. 자동 조회 (UX 편의성)
    loadDailySales();
}

function loadDailySales() {
    const branch = document.getElementById('ds_branch').value;
    const month = document.getElementById('ds_month').value;
    
    if(!month) { alert("조회할 월을 선택해주세요."); return; }

    // ★ [추가] 현재 로그인한 사람의 권한 가져오기
    let userRole = 'STAFF'; // 기본값
    try {
        const saved = sessionStorage.getItem('dbphone_user');
        if(saved) {
            const u = JSON.parse(saved);
            userRole = u.role || 'STAFF';
        }
    } catch(e) {}
    
    // 로딩 표시 (기존 스타일)
    document.getElementById('ds_tbody').innerHTML = `
        <tr><td colspan="7" class="py-5">
            <div class="spinner-border text-primary"></div>
            <div class="mt-2 small text-muted">데이터 분석 중...</div>
        </td></tr>`;

    // ★ requestAPI 사용 (기존 코드 일관성 유지)
    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "get_daily_sales_report",
            branch: branch,
            month: month,
            role: userRole // ★ [핵심] 여기에 role을 실어서 보냅니다!
        })
    })
    .then(r => r.json())
    .then(d => {
        if(d.status === 'success') {
            renderDailySalesUI(d.list, d.total);
        } else {
            document.getElementById('ds_tbody').innerHTML = `<tr><td colspan="6" class="text-danger py-4">${d.message}</td></tr>`;
        }
    })
    .catch(e => {
        console.error(e);
        document.getElementById('ds_tbody').innerHTML = `<tr><td colspan="6" class="text-danger py-4">통신 오류 발생</td></tr>`;
    });
}

function renderDailySalesUI(list, total) {
    const tbody = document.getElementById('ds_tbody');
    const fmt = (n) => Number(n).toLocaleString();
    
    // 1. 상단 요약 카드 업데이트
    document.getElementById('ds_total_cnt').innerText = total.cnt + "건";
    document.getElementById('ds_total_set').innerText = fmt(total.set);
    document.getElementById('ds_total_rev').innerText = fmt(total.rev);
    document.getElementById('ds_total_mar').innerText = fmt(total.mar);

    // 2. 테이블 렌더링
    let html = "";
    
    // ★ [변수 선언부] 순서 중요!
    const today = new Date(); // 1. today를 가장 먼저 정의
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const currentMonth = `${yyyy}-${mm}`; // 2. 그 다음 currentMonth 정의
    const todayDate = today.getDate();    // 3. 그 다음 todayDate 정의

    const selectedMonth = document.getElementById('ds_month').value;

    list.forEach(item => {
        // 데이터 없는 날은 흐리게
        const isDataEmpty = (item.totalCnt === 0 && item.margin === 0);
        const rowClass = isDataEmpty ? "text-muted opacity-50" : "fw-bold text-dark";
        
        // 오늘 날짜 하이라이트 (배경색)
        let bgClass = "";
        // 선택한 달이 '이번 달'이고, 리스트의 날짜가 '오늘'이면 노란색
        if (selectedMonth === currentMonth && item.day === todayDate) {
            bgClass = "table-warning border-2 border-warning"; 
        }

        html += `
        <tr class="${bgClass}">
            <td class="${rowClass}">${item.day}일</td>
            <td class="text-primary ${item.mobile > 0 ? 'fw-bold' : ''}">${item.mobile > 0 ? item.mobile : '-'}</td>
            <td class="text-success ${item.wired > 0 ? 'fw-bold' : ''}">${item.wired > 0 ? item.wired : '-'}</td>
            <td class="bg-light fw-bold">${item.totalCnt > 0 ? item.totalCnt : '-'}</td>
            <td class="text-end pe-3 text-secondary small">${item.settle > 0 ? fmt(item.settle) : '-'}</td>
            <td class="text-end pe-3 text-secondary small">${item.revenue > 0 ? fmt(item.revenue) : '-'}</td>
            <td class="text-end pe-3 fw-bold text-danger">${item.margin > 0 ? fmt(item.margin) : '-'}</td>
        </tr>`;
    });
    tbody.innerHTML = html;

    // 3. 차트 그리기
    renderMixedChart(list);
}

function renderMixedChart(list) {
    const ctx = document.getElementById('dailySalesChart').getContext('2d');
    
    if (dailySalesChartInstance) {
        dailySalesChartInstance.destroy();
    }

    const labels = list.map(i => i.day + '일');
    const dataMargin = list.map(i => i.margin); // 막대 (돈)
    const dataCount = list.map(i => i.totalCnt); // 선 (개수)

    dailySalesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '총 수익(마진)',
                    data: dataMargin,
                    type: 'bar',
                    backgroundColor: 'rgba(231, 29, 54, 0.2)', // Danger color 투명도
                    borderColor: 'rgba(231, 29, 54, 0.8)',
                    borderWidth: 1,
                    borderRadius: 2,
                    order: 2,
                    yAxisID: 'y_money' // 왼쪽 축 사용
                },
                {
                    label: '총 실적(건)',
                    data: dataCount,
                    type: 'line',
                    borderColor: '#4361ee', // Primary color
                    backgroundColor: '#4361ee',
                    borderWidth: 2,
                    pointRadius: 2,
                    tension: 0.3, // 부드러운 곡선
                    order: 1,
                    yAxisID: 'y_count' // 오른쪽 축 사용
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                if (context.dataset.type === 'bar') {
                                    label += context.parsed.y.toLocaleString() + '원';
                                } else {
                                    label += context.parsed.y + '건';
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    grid: { display: false },
                    ticks: { maxTicksLimit: 10, font: { size: 10 } }
                },
                // [왼쪽 축] 돈 (마진)
                y_money: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { borderDash: [4, 4] },
                    ticks: {
                        callback: function(value) { return value >= 10000 ? (value/10000) + '만' : value; },
                        font: { size: 10 }
                    }
                },
                // [오른쪽 축] 건수
                y_count: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { display: false },
                    ticks: { stepSize: 1, font: { size: 10 } },
                    suggestedMax: 5 // 건수가 적어도 그래프가 안 눌리게
                }
            }
        }
    });
}

// [script.js] 판매 분석 (파이 차트) 로직
// 탭 전환 시 조회 함수 분기
function refreshAnalysis() {
    const activeTab = document.querySelector('#pills-tab .active').id;
    if (activeTab === 'pills-trend-tab') loadDailySales();
    else loadSalesAnalysis();
}

let chartModelInstance = null;
let chartCarrierInstance = null;

function loadSalesAnalysis() {
    const branch = document.getElementById('ds_branch').value;
    const month = document.getElementById('ds_month').value;
    
    if(!month) { alert("조회할 월을 선택해주세요."); return; }

    // 기존 차트 초기화 (잔상 방지)
    if (chartModelInstance) { chartModelInstance.destroy(); chartModelInstance = null; }
    if (chartCarrierInstance) { chartCarrierInstance.destroy(); chartCarrierInstance = null; }

    // 로딩 중 표시 (캔버스 위에 글씨 쓰기 어려우니 비동기로 처리)
    
    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "get_sales_analysis",
            branch: branch,
            month: month
        })
    })
    .then(r => r.json())
    .then(d => {
        if(d.status === 'success') {
            renderPieCharts(d.models, d.carriers);
        } else {
            alert("데이터 로드 실패: " + d.message);
        }
    })
    .catch(e => console.error(e));
}

// [script.js] 파이 차트 렌더링 함수 (색상 자동화 + 퍼센트 표시 + 기타 분류 완화)
function renderPieCharts(modelData, carrierData) {
    // 🎨 예쁜 색상 팔레트 (20가지 색상 준비)
    const palette = [
        '#4361ee', '#3a0ca3', '#7209b7', '#f72585', '#4cc9f0', 
        '#f94144', '#f3722c', '#f8961e', '#f9844a', '#90be6d', 
        '#43aa8b', '#577590', '#277da1', '#6d597a', '#b56576',
        '#e56b6f', '#eaac8b', '#0081a7', '#00afb9', '#fdfcdc'
    ];

    // -----------------------------------------------------------
    // 1. 모델별 차트 (도넛)
    // -----------------------------------------------------------
    const modelCtx = document.getElementById('chartModelShare').getContext('2d');
    
    // 데이터 정렬 (판매량 많은 순)
    const sortedModels = Object.entries(modelData).sort((a, b) => b[1] - a[1]);
    
    let mLabels = [], mValues = [];
    let mColors = [];

    // ★ [수정] 상위 15개까지 보여줌 (기존 5개 -> 15개로 확장하여 '기타' 줄임)
    const LIMIT = 15; 

    // 총합 계산 (퍼센트 구하기용)
    const totalModelCount = sortedModels.reduce((acc, cur) => acc + cur[1], 0);

    if (sortedModels.length > LIMIT) {
        // 상위 N개
        for(let i=0; i<LIMIT; i++) {
            const name = sortedModels[i][0];
            const count = sortedModels[i][1];
            const pct = ((count / totalModelCount) * 100).toFixed(1); // 소수점 1자리
            
            mLabels.push(`${name} (${pct}%)`); // ★ 라벨에 % 추가
            mValues.push(count);
            mColors.push(palette[i % palette.length]); // 색상 순환
        }
        // 나머지 기타 처리
        const otherSum = sortedModels.slice(LIMIT).reduce((acc, cur) => acc + cur[1], 0);
        const otherPct = ((otherSum / totalModelCount) * 100).toFixed(1);
        mLabels.push(`기타 (${otherPct}%)`);
        mValues.push(otherSum);
        mColors.push('#ced4da'); // 기타는 회색
    } else {
        // 개수가 적으면 다 보여줌
        sortedModels.forEach((item, index) => {
            const name = item[0];
            const count = item[1];
            const pct = ((count / totalModelCount) * 100).toFixed(1);
            
            mLabels.push(`${name} (${pct}%)`);
            mValues.push(count);
            mColors.push(palette[index % palette.length]);
        });
    }

    // 데이터 없음 예외처리
    if (mValues.length === 0) { mLabels=["데이터 없음"]; mValues=[1]; mColors=['#e9ecef']; }

    chartModelInstance = new Chart(modelCtx, {
        type: 'doughnut',
        data: {
            labels: mLabels,
            datasets: [{
                data: mValues,
                backgroundColor: mColors,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'right', 
                    labels: { 
                        boxWidth: 12, 
                        font: { size: 11 },
                        usePointStyle: true // 동그라미 아이콘
                    } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            // 툴팁에는 '15대' 처럼 실제 개수 표시
                            let label = context.label.split(' (')[0]; 
                            let value = context.raw;
                            return `${label}: ${value}대`;
                        }
                    }
                }
            }
        }
    });

    // -----------------------------------------------------------
    // 2. 통신사(개통처)별 차트 (파이)
    // -----------------------------------------------------------
    const carrierCtx = document.getElementById('chartCarrierShare').getContext('2d');
    
    // 개통처도 많은 순으로 정렬
    const sortedCarriers = Object.entries(carrierData).sort((a, b) => b[1] - a[1]);
    
    let cLabels = [], cValues = [];
    let cColors = [];
    const totalCarrierCount = sortedCarriers.reduce((acc, cur) => acc + cur[1], 0);

    sortedCarriers.forEach((item, index) => {
        const name = item[0];
        const count = item[1];
        const pct = ((count / totalCarrierCount) * 100).toFixed(1);

        cLabels.push(`${name} (${pct}%)`); // ★ 라벨에 % 추가
        cValues.push(count);
        cColors.push(palette[index % palette.length]); // ★ 자동 색상 할당 (회색 탈출!)
    });

    if (cValues.length === 0) { cLabels=["데이터 없음"]; cValues=[1]; cColors=['#e9ecef']; }

    chartCarrierInstance = new Chart(carrierCtx, {
        type: 'pie',
        data: {
            labels: cLabels,
            datasets: [{
                data: cValues,
                backgroundColor: cColors,
                borderWidth: 1,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'right',
                    labels: { 
                        boxWidth: 12, 
                        font: { size: 11 },
                        usePointStyle: true 
                    } 
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label.split(' (')[0];
                            let value = context.raw;
                            return `${label}: ${value}건`;
                        }
                    }
                }
            }
        }
    });
}

// [script.js 수정] 3. [기간별 집계] 렌더링 (지점별 그룹화 + 소계)
function renderPeriodStats(data) {
    const tbody = document.getElementById('sp_tbody');
    const tfoot = document.getElementById('sp_tfoot');

    tbody.innerHTML = "";
    tfoot.innerHTML = "";

    // 1. 관리자 권한 체크
    if (!data.isAdmin) {
        tbody.innerHTML = `<tr style="height: 450px;"><td colspan="8" class="align-middle text-danger fw-bold"><i class="bi bi-lock-fill fs-1 d-block mb-3"></i>관리자 전용 화면입니다.</td></tr>`;
        return;
    }

    // 2. 데이터 유무 체크
    let hasData = false;
    if (data.viewType === 'carrier') hasData = data.periodData.length > 0;
    else hasData = data.periodData.some(b => b.list.length > 0);

    if (!hasData) {
        tbody.innerHTML = `<tr style="height: 450px;"><td colspan="8" class="text-muted align-middle"><i class="bi bi-exclamation-circle fs-1 d-block mb-3 opacity-25"></i>해당 기간에 데이터가 없습니다.</td></tr>`;
        return;
    }

    const fmt = (n) => Number(n).toLocaleString();

    let totalMobile = 0, totalWired = 0, totalSettle = 0, totalMargin = 0;
    let totalDevice = 0, totalUsed = 0, totalGift = 0;

    // (1) 지점별 보기
    if (data.viewType === 'branch') {
        data.periodData.forEach(branch => {
            if (branch.list.length === 0) return;

            let subMobile = 0, subWired = 0, subSettle = 0, subMargin = 0;
            let subDevice = 0, subUsed = 0, subGift = 0;

            // ★ [수정 1] 지점 헤더 다시 복구 (가장 깔끔한 스타일)
            tbody.insertAdjacentHTML('beforeend', `
                <tr class="table-light">
                    <td colspan="8" class="fw-bold text-start ps-4 text-dark" style="background-color: #f1f3f5;">
                        <span style="font-size: 1.1rem; margin-right: 6px;">🏢</span>${branch.branch}
                    </td>
                </tr>
            `);

            // 직원 리스트
            branch.list.forEach(item => {
                totalMobile += item.mCount; totalWired += item.wCount; totalSettle += item.settlement;
                totalMargin += item.margin; totalDevice += item.deviceSum; totalUsed += item.usedPhone; totalGift += item.gift;

                subMobile += item.mCount; subWired += item.wCount; subSettle += item.settlement;
                subMargin += item.margin; subDevice += item.deviceSum; subUsed += item.usedPhone; subGift += item.gift;

                tbody.insertAdjacentHTML('beforeend', `
                    <tr>
                        <td class="fw-bold text-secondary">${item.name}</td>
                        <td>${item.mCount}</td>
                        <td>${item.wCount}</td>
                        <td class="text-end pe-3 text-muted" style="font-size:0.85rem;">${fmt(item.deviceSum)}</td>
                        <td class="text-end pe-3 text-muted" style="font-size:0.85rem;">${fmt(item.usedPhone)}</td>
                        <td class="text-end pe-3 text-muted" style="font-size:0.85rem;">${fmt(item.gift)}</td>
                        <td class="text-end pe-3 fw-bold text-dark">${fmt(item.settlement)}</td>
                        <td class="text-end pe-3 fw-bold text-danger">${fmt(item.margin)}</td>
                    </tr>
                `);
            });

            // ★ [수정 2] 소계는 딱 '소 계'라고만 표시 (지점명 제거)
            tbody.insertAdjacentHTML('beforeend', `
                <tr style="background-color: #eef2ff; border-top: 1px solid #dee2e6; border-bottom: 2px solid #cbd3e6;">
                    <td class="text-primary fw-bold">소 계</td>
                    <td class="text-primary fw-bold">${subMobile}</td>
                    <td class="text-primary fw-bold">${subWired}</td>
                    <td class="text-end pe-3 text-primary fw-bold">${fmt(subDevice)}</td>
                    <td class="text-end pe-3 text-primary fw-bold">${fmt(subUsed)}</td>
                    <td class="text-end pe-3 text-primary fw-bold">${fmt(subGift)}</td>
                    <td class="text-end pe-3 text-primary fw-bold">${fmt(subSettle)}</td>
                    <td class="text-end pe-3 text-danger fw-bold" style="font-size:1rem;">${fmt(subMargin)}</td>
                </tr>
            `);
        });
    } 
    // (2) 거래처별 보기
    else {
        data.periodData.forEach(item => {
            totalMobile += item.mCount; totalWired += item.wCount; totalSettle += item.settlement;
            totalMargin += item.margin; totalDevice += item.deviceSum; totalUsed += item.usedPhone; totalGift += item.gift;

            tbody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td class="fw-bold">${item.name}</td>
                    <td>${item.mCount}</td>
                    <td>${item.wCount}</td>
                    <td class="text-end pe-3 text-muted" style="font-size:0.85rem;">${fmt(item.deviceSum)}</td>
                    <td class="text-end pe-3 text-muted" style="font-size:0.85rem;">${fmt(item.usedPhone)}</td>
                    <td class="text-end pe-3 text-muted" style="font-size:0.85rem;">${fmt(item.gift)}</td>
                    <td class="text-end pe-3 fw-bold text-dark">${fmt(item.settlement)}</td>
                    <td class="text-end pe-3 fw-bold text-danger">${fmt(item.margin)}</td>
                </tr>
            `);
        });
    }

    // Footer (총 합계)
    tfoot.innerHTML = `
        <tr class="table-primary border-top border-primary" style="border-top-width: 3px;">
            <td class="text-primary fw-bolder">총 합계</td>
            <td class="text-primary fw-bolder">${totalMobile}</td>
            <td class="text-primary fw-bolder">${totalWired}</td>
            <td class="text-end pe-3 text-primary fw-bolder">${fmt(totalDevice)}</td>
            <td class="text-end pe-3 text-primary fw-bolder">${fmt(totalUsed)}</td>
            <td class="text-end pe-3 text-primary fw-bolder">${fmt(totalGift)}</td>
            <td class="text-end pe-3 text-primary fw-bolder">${fmt(totalSettle)}</td>
            <td class="text-end pe-3 text-danger fw-bolder" style="font-size:1.2rem;">${fmt(totalMargin)}</td>
        </tr>
    `;
}

// [script.js 수정] 4. 직원별 집계 렌더링 (5단 상세 분류)
function renderStaffStats(data) {
    const tbody = document.getElementById('ss_tbody');
    const tfoot = document.getElementById('ss_tfoot');

    // 안전장치
    if (!tbody || !tfoot) return;

    tbody.innerHTML = "";
    tfoot.innerHTML = "";

    // -----------------------------------------------------------
    // ★ [핵심] 권한 필터링 로직 추가
    // -----------------------------------------------------------
    let displayList = data.staffData || [];
    
    // 현재 로그인 정보 가져오기
    let myName = "";
    let myRole = "STAFF";
    try {
        const u = JSON.parse(sessionStorage.getItem('dbphone_user'));
        myName = u.name;
        myRole = u.role;
    } catch(e) {}

    // 사장님(MASTER)이 아니면, 내 이름과 같은 데이터만 남김
    if (myRole !== 'MASTER') {
        displayList = displayList.filter(item => item.name === myName);
    }
    // -----------------------------------------------------------

    // 데이터 없음 처리
    if (displayList.length === 0) {
        tbody.innerHTML = `
            <tr style="height: 450px;">
                <td colspan="7" class="text-muted align-middle">
                    <i class="bi bi-exclamation-circle fs-1 d-block mb-3 opacity-25"></i>
                    조회된 실적이 없습니다.
                </td>
            </tr>`;
        return;
    }

    const fmt = (n) => Number(n).toLocaleString();
    
    // 항목별 합계 변수
    let sumMobile = 0, sumUsed = 0, sumCopper = 0, sumRenew = 0, sumSingle = 0, sumMargin = 0;

    displayList.forEach(item => {
        sumMobile += item.cnt_mobile;
        sumUsed += item.cnt_used;
        sumCopper += item.cnt_copper;
        sumRenew += item.cnt_renew;
        sumSingle += item.cnt_single;
        sumMargin += item.margin;

        // 마진 표시 (0원일때는 빈칸)
        let marginDisplay = (item.margin === 0) 
            ? "" 
            : `<span class="text-danger fw-bold">${fmt(item.margin)}</span>`;

        // 내 데이터인 경우 배경색 살짝 강조
        const rowClass = (item.name === myName) ? "bg-warning bg-opacity-10" : "";

        tbody.insertAdjacentHTML('beforeend', `
            <tr class="${rowClass}">
                <td class="fw-bold">${item.name}</td>
                
                <td class="fw-bold text-primary bg-primary bg-opacity-10">${item.cnt_mobile}</td>
                
                <td>${item.cnt_used}</td>
                
                <td class="fw-bold text-success bg-success bg-opacity-10">${item.cnt_copper}</td>
                
                <td class="text-muted">${item.cnt_renew}</td>
                <td class="text-muted">${item.cnt_single}</td>
                <td class="text-end pe-4">${marginDisplay}</td>
            </tr>
        `);
    });

    // 하단 합계
    tfoot.innerHTML = `
        <tr class="border-top border-success text-success bg-light">
            <td class="fw-bold text-dark">합계</td>
            
            <td class="fw-bold text-primary bg-primary bg-opacity-10">${sumMobile}</td>
            
            <td class="fw-bold text-dark">${sumUsed}</td>
            
            <td class="fw-bold text-success bg-success bg-opacity-10">${sumCopper}</td>
            
            <td class="fw-bold text-dark">${sumRenew}</td>
            <td class="fw-bold text-dark">${sumSingle}</td>
            <td class="text-end pe-4 fw-bold text-danger" style="font-size:1.1rem;">${fmt(sumMargin)}</td>
        </tr>
    `;
}

// =========================================================
// [최종 복구] 제휴카드 / 유선설치 (카드형 리스트 + 바로 입력 방식)
// =========================================================

// 0. 초기화: 날짜 기본값 세팅 (이번달 1일 ~ 오늘)
function initSetupDates() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    
    const firstDay = `${yyyy}-${mm}-01`;
    const todayStr = `${yyyy}-${mm}-${dd}`;

    document.getElementById('search_card_start').value = firstDay;
    document.getElementById('search_card_end').value = todayStr;
    document.getElementById('search_wired_start').value = firstDay;
    document.getElementById('search_wired_end').value = todayStr;
}

// 1. 통합 검색 함수
function searchSetupList(type) {
    const branchId = type === 'card' ? 'search_card_branch' : 'search_wired_branch';
    const startId = type === 'card' ? 'search_card_start' : 'search_wired_start';
    const endId = type === 'card' ? 'search_card_end' : 'search_wired_end';
    const keyId = type === 'card' ? 'search_card_keyword' : 'search_wired_keyword';
    
    // 리스트 컨테이너 ID
    const containerId = type === 'card' ? 'card_setup_list' : 'wired_setup_list';

    const branch = document.getElementById(branchId).value;
    const start = document.getElementById(startId).value;
    const end = document.getElementById(endId).value;
    const keyword = document.getElementById(keyId).value;
    const container = document.getElementById(containerId);

    // 로딩 표시
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-secondary"></div><div class="mt-2 small text-muted">데이터 조회 중...</div></div>';

    fetch(GAS_URL, { 
        method: "POST",
        body: JSON.stringify({
            action: "get_setup_pending_list", 
            type: type,
            branch: branch,
            startDate: start,
            endDate: end,
            keyword: keyword
        })
    })
    .then(r => r.json())
    .then(d => {
        if (d.status === 'success') {
            if (type === 'card') renderCardSetupList(d.list);
            else renderWiredSetupList(d.list);
        } else {
            container.innerHTML = `<div class="text-center text-danger py-5 small">${d.message}</div>`;
        }
    })
    .catch(e => {
        container.innerHTML = `<div class="text-center text-danger py-5 small">통신 오류가 발생했습니다.</div>`;
    });
}

// 2. 제휴카드 렌더링 (UI 디자인 업그레이드: 세련된 입력 그룹)
function renderCardSetupList(list) {
    const container = document.getElementById('card_setup_list');
    
    if (!list || list.length === 0) {
        container.innerHTML = `<div class="text-center text-muted py-5 small"><i class="bi bi-check-circle fs-1 d-block mb-3 opacity-25"></i>미처리 내역이 없습니다. (모두 완료)</div>`;
        return;
    }

    container.innerHTML = list.map(item => {
        const rowId = `card_${item.branch}_${item.rowIndex}`;
        const v1 = item.val1 || ""; 
        const v2 = item.val2 || "";

        // 값이 '미사용'이면 빨간색 텍스트, 아니면 기본색
        const color1 = v1 === '미사용' ? 'text-danger' : 'text-primary';
        const color2 = v2 === '미사용' ? 'text-danger' : 'text-primary';

        return `
        <div class="glass-card p-3 mb-3 border-start border-4 border-primary shadow-sm bg-white">
            <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
                <div>
                    <span class="badge bg-primary bg-opacity-10 text-primary me-1 border border-primary">제휴카드</span>
                    <span class="badge bg-light text-secondary border">${item.branch}</span>
                </div>
                <span class="small fw-bold text-muted">${item.date}</span>
            </div>
            
            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <div class="fw-bold fs-5 text-dark">${item.name}</div>
                    <div class="small text-secondary fw-bold mt-1">
                        <i class="bi bi-credit-card-2-front me-1 text-primary"></i>${item.cardName}
                    </div>
                </div>
                <span class="badge bg-white text-dark border rounded-pill px-2 shadow-sm">
                    <i class="bi bi-person-circle me-1 text-muted"></i>${item.manager || '미지정'}
                </span>
            </div>
            
            <div class="bg-light p-3 rounded-3 border">
                <div class="row g-2 mb-3">
                    
                    <div class="col-6">
                        <label class="form-label-sm fw-bold text-secondary small mb-1 ms-1">세이브 등록</label>
                        <div class="input-group input-group-sm shadow-sm">
                            <input type="text" class="form-control border-primary fw-bold text-center ${color1}" 
                                   id="val1_${rowId}" value="${v1}" placeholder="날짜" 
                                   onfocus="if(this.value!=='미사용')this.type='date'" 
                                   onblur="if(!this.value)this.type='text'"
                                   style="border-right: none;">
                            <button class="btn btn-white border border-primary border-start-0 text-muted" type="button" 
                                    onclick="setUnused('val1_${rowId}')" title="미사용 처리" 
                                    style="background: white;">
                                <i class="bi bi-slash-circle"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="col-6">
                        <label class="form-label-sm fw-bold text-secondary small mb-1 ms-1">자동이체 등록</label>
                        <div class="input-group input-group-sm shadow-sm">
                            <input type="text" class="form-control border-primary fw-bold text-center ${color2}" 
                                   id="val2_${rowId}" value="${v2}" placeholder="날짜" 
                                   onfocus="if(this.value!=='미사용')this.type='date'" 
                                   onblur="if(!this.value)this.type='text'"
                                   style="border-right: none;">
                            <button class="btn btn-white border border-primary border-start-0 text-muted" type="button" 
                                    onclick="setUnused('val2_${rowId}')" title="미사용 처리" 
                                    style="background: white;">
                                <i class="bi bi-slash-circle"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <button class="btn btn-primary w-100 btn-sm fw-bold shadow hover-effect" onclick="saveSetupInfo('card', '${item.branch}', '${item.rowIndex}', '${rowId}')">
                    <i class="bi bi-check-lg me-1"></i> 저장하기
                </button>
            </div>
        </div>`;
    }).join('');
    
    // 날짜 입력 이벤트 리스너 (기존과 동일)
    document.querySelectorAll('input[id^="val"]').forEach(el => {
        el.addEventListener('input', function() {
            // 값이 바뀌면 글자색을 파란색으로 (미사용일땐 빨강이었음)
            if(this.value !== '미사용') {
                this.classList.remove('text-danger');
                this.classList.add('text-primary');
            }
        });
    });
}

// [script.js] 미사용 버튼 동작 (글자색 빨강으로 변경 추가)
function setUnused(inputId) {
    const el = document.getElementById(inputId);
    el.type = 'text'; 
    el.value = '미사용';
    // 시각적 강조
    el.classList.remove('text-primary');
    el.classList.add('text-danger');
}

// 3. 유선설치 리스트 렌더링 (카드 내부에 입력창 배치)
function renderWiredSetupList(list) {
    const container = document.getElementById('wired_setup_list');
    
    if (!list || list.length === 0) {
        container.innerHTML = `<div class="text-center text-muted py-5 small">
            <i class="bi bi-check-circle fs-1 d-block mb-3 opacity-25"></i>
            미처리 내역이 없습니다. (모두 완료!)
        </div>`;
        return;
    }

    container.innerHTML = list.map(item => {
        const rowId = `wired_${item.branch}_${item.rowIndex}`;
        const v1 = item.val1 ? String(item.val1).substring(0, 10) : "";
        const v2 = item.val2 ? String(item.val2).substring(0, 10) : "";

        return `
        <div class="glass-card p-3 mb-3 border-start border-4 border-success shadow-sm" style="background: #fff;">
            <div class="d-flex justify-content-between align-items-center mb-2 border-bottom pb-2">
                <div>
                    <span class="badge bg-success bg-opacity-10 text-success me-1 border border-success">유선설치</span>
                    <span class="badge bg-light text-secondary border">${item.branch}</span>
                </div>
                <span class="small fw-bold text-muted">${item.date}</span>
            </div>

            <div class="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <div class="fw-bold fs-5 text-dark">${item.name}</div>
                    <div class="small text-success fw-bold mt-1"><i class="bi bi-router me-1"></i>${item.type}</div>
                </div>
                <span class="badge bg-white text-dark border rounded-pill px-2">
                    <i class="bi bi-person-circle me-1"></i>${item.manager || '미지정'}
                </span>
            </div>

            <div class="bg-light p-3 rounded-3 border">
                <div class="row g-2 mb-2">
                    <div class="col-6">
                        <label class="form-label-sm fw-bold text-muted small" style="font-size: 0.75rem;">설치 예정일</label>
                        <input type="date" class="form-control form-control-sm border-success fw-bold text-center" id="val1_${rowId}" value="${v1}">
                    </div>
                    <div class="col-6">
                        <label class="form-label-sm fw-bold text-muted small" style="font-size: 0.75rem;">설치 완료일</label>
                        <input type="date" class="form-control form-control-sm border-success fw-bold text-center" id="val2_${rowId}" value="${v2}">
                    </div>
                </div>
                <button class="btn btn-success w-100 btn-sm fw-bold shadow-sm" onclick="saveSetupInfo('wired', '${item.branch}', '${item.rowIndex}', '${rowId}')">
                    <i class="bi bi-check-lg me-1"></i> 저장하기
                </button>
            </div>
        </div>`;
    }).join('');
}

// 4. 저장 함수 (입력값 그대로 전송)
function saveSetupInfo(type, branch, rowIndex, rowId) {
    const val1 = document.getElementById(`val1_${rowId}`).value;
    const val2 = document.getElementById(`val2_${rowId}`).value;

    if (!confirm("입력된 정보로 저장하시겠습니까?")) return;

    if(typeof Swal !== 'undefined') Swal.fire({ title: '저장 중...', didOpen: () => Swal.showLoading() });

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "update_setup_info",
            type: type,
            branch: branch,
            rowIndex: rowIndex,
            val1: val1,
            val2: val2
        })
    })
    .then(r => r.json())
    .then(d => {
        if (d.status === 'success') {
            if(typeof Swal !== 'undefined') Swal.fire({ icon: 'success', title: '처리 완료', timer: 1000, showConfirmButton: false });
            else alert("저장되었습니다.");
            // 목록 갱신
            searchSetupList(type);
        } else {
            alert(d.message);
        }
    })
    .catch(e => {
        alert("통신 오류가 발생했습니다.");
    });
}

// ==========================================
// [신규] 관리자 DB 열람 로직
// ==========================================

function searchDbView() {
    // ★ [추가] 지점 값 읽기
    const branch = document.getElementById('view_branch').value;
    const start = document.getElementById('view_start').value;
    const end = document.getElementById('view_end').value;
    const carrier = document.getElementById('view_carrier').value;
    const actType = document.getElementById('view_act_type').value;
    const contType = document.getElementById('view_cont_type').value;
    
    const container = document.getElementById('db_view_result');
    container.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-dark"></div><div class="mt-2 small text-muted">데이터를 불러오는 중...</div></div>';

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "get_db_view",
            branch: branch, // ★ 서버로 전송
            start: start,
            end: end,
            carrier: carrier,
            actType: actType,
            contType: contType
        })
    })
    .then(r => r.json())
    .then(d => {
        if (d.status === 'success') {
            renderDbViewList(d.list);
        } else {
            container.innerHTML = `<div class="text-center text-danger py-5 small">${d.message}</div>`;
        }
    })
    .catch(e => {
        container.innerHTML = `<div class="text-center text-danger py-5 small">통신 오류 발생</div>`;
    });
}

// [script.js] DB 열람 결과 렌더링 (테이블 형태)
function renderDbViewList(list) {
    const container = document.getElementById('db_view_result');
    
    if (!list || list.length === 0) {
        container.innerHTML = `<div class="text-center text-muted py-5 small">
            <i class="bi bi-exclamation-circle fs-1 d-block mb-3 opacity-25"></i>
            검색 결과가 없습니다.
        </div>`;
        return;
    }

    // 총 건수 표시
    const countHeader = `<div class="d-flex justify-content-between align-items-center mb-2">
        <span class="fw-bold text-dark"><i class="bi bi-list-columns-reverse me-1"></i>조회 결과</span>
        <span class="badge bg-dark rounded-pill">총 ${list.length}건</span>
    </div>`;

    // ★ [변경] 테이블 헤더 생성
    let tableHtml = `
    <div class="table-responsive border rounded shadow-sm bg-white">
        <table class="table table-hover table-striped align-middle text-center small mb-0" style="white-space: nowrap; font-size: 0.85rem;">
            <thead class="table-dark sticky-top">
                <tr>
                    <th>개통일</th>
                    <th>지점</th>
                    <th>통신사</th>
                    <th>유형</th>
                    <th>약정</th>
                    <th>고객명</th>
                    <th>생년월일</th>
                    <th>전화번호</th>
                    <th>모델명</th>
                </tr>
            </thead>
            <tbody>
    `;

    // ★ [변경] 테이블 행(Row) 생성
    const rows = list.map(item => {
        // 통신사별 글자색 포인트
        let carrierClass = "text-dark";
        if (item.carrier === 'SKT') carrierClass = "text-danger fw-bold";
        else if (item.carrier === 'KT') carrierClass = "text-dark fw-bold";
        else if (item.carrier === 'LG') carrierClass = "text-primary fw-bold";

        return `
            <tr>
                <td>${item.date}</td>
                <td><span class="badge bg-light text-secondary border">${item.branch}</span></td>
                <td class="${carrierClass}">${item.carrier}</td>
                <td class="fw-bold text-primary">${item.actType}</td>
                <td class="text-muted">${item.contType}</td>
                <td class="fw-bold text-dark">${item.name}</td>
                <td>${item.birth}</td>
                <td class="font-monospace">${item.phone}</td>
                <td class="text-start text-truncate" style="max-width: 150px;" title="${item.model}">${item.model}</td>
            </tr>
        `;
    }).join('');

    tableHtml += rows + `</tbody></table></div>`;

    container.innerHTML = countHeader + tableHtml;
}

// ==========================================
// [진짜_최종] PDF 저장 (브라우저 네이티브 인쇄 엔진 사용)
// ==========================================
function downloadDbPdf() {
    const tableDiv = document.getElementById('db_view_result');
    
    // 1. 데이터 확인
    if (!tableDiv || tableDiv.innerText.includes("검색 결과가 없습니다") || tableDiv.innerText.includes("조건을 선택하고")) {
        alert("저장할 데이터가 없습니다. 먼저 조회를 해주세요.");
        return;
    }

    // 2. 파일명 및 타이틀 정보 생성
    const branch = document.getElementById('view_branch').value;
    const start = document.getElementById('view_start').value;
    const end = document.getElementById('view_end').value;
    const carrier = document.getElementById('view_carrier').value;
    const actType = document.getElementById('view_act_type').value;
    const contType = document.getElementById('view_cont_type').value;

    const title = `DB상세 지점: ${branch}`;
    const subTitle = `기간: ${start} ~ ${end} | 통신사: ${carrier}/개통유형: ${actType}/약정유형: ${contType}`;

    // 3. 현재 테이블의 HTML 가져오기 (스크롤 영역 무시하고 내용만 가져옴)
    // 테이블 내의 배지 색상 등 스타일을 유지하기 위해 clone을 뜹니다.
    const originalTable = tableDiv.querySelector('table');
    const tableHtml = originalTable.outerHTML;

    // 4. 인쇄용 팝업 윈도우 생성 (사용자 눈에는 미리보기 창으로 뜸)
    const win = window.open('', '_blank', 'width=1200,height=900');
    
    // 5. 인쇄용 문서 작성 (HTML + CSS 주입)
    win.document.write(`
        <html>
        <head>
            <title>${title}</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                @page { 
                    size: A4 landscape; /* 가로 모드 */
                    margin: 10mm; 
                }
                body { 
                    font-family: 'Noto Sans KR', sans-serif; 
                    padding: 20px; 
                    -webkit-print-color-adjust: exact; /* 배경색/뱃지 색상 강제 출력 */
                    print-color-adjust: exact;
                }
                h3 { font-weight: bold; margin-bottom: 5px; }
                p { font-size: 12px; color: #555; margin-bottom: 20px; }
                
                /* 테이블 스타일 최적화 */
                table { width: 100%; border-collapse: collapse; font-size: 10px; }
                th { background-color: #f8f9fa !important; color: #000 !important; text-align: center; white-space: nowrap; }
                td { vertical-align: middle; padding: 4px 2px !important; }
                
                /* 뱃지 크기 조정 */
                .badge { font-size: 9px !important; padding: 2px 4px !important; border: 1px solid #ddd; }
                
                /* 링크/버튼 숨기기 */
                .no-print { display: none !important; }
            </style>
        </head>
        <body>
            <h3>${title}</h3>
            <p>${subTitle}</p>
            <div class="table-responsive">
                ${tableHtml}
            </div>
            <script>
                // 로딩(CSS 적용) 완료 후 인쇄 실행
                window.onload = function() {
                    setTimeout(function() {
                        window.print(); // 인쇄 다이얼로그 호출
                        window.close(); // 인쇄 후 창 닫기 (일부 브라우저는 사용자가 닫아야 함)
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);

    win.document.close(); // 문서 작성 완료 신호
    win.focus(); // 윈도우 포커스
}

// 목표 설정 모달 열기
function openGoalModal() {
    new bootstrap.Modal(document.getElementById('modal-set-goal')).show();
}

// 목표 저장
function submitGoal() {
    const branch = document.getElementById('goal_branch').value;
    const mobile = document.getElementById('goal_mobile').value;
    const wired = document.getElementById('goal_wired').value;

    if(!mobile || !wired) { alert("목표 수량을 입력해주세요."); return; }

    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "set_monthly_goal",
            branch: branch,
            mobile: mobile,
            wired: wired
        })
    })
    .then(r => r.json())
    .then(d => {
        alert(d.message);
        bootstrap.Modal.getInstance(document.getElementById('modal-set-goal')).hide();
        loadDashboard(); // 대시보드 새로고침 (그래프 반영)
    })
    .catch(e => alert("저장 실패"));
}

// ==========================================
// [업그레이드] 약정 만료(CRM) 관리 (날짜기반 + 마스킹)
// ==========================================

function showCrmSection() {
    // 1. 오늘 날짜 자동 세팅 (YYYY-MM-DD 포맷)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    
    const dateInput = document.getElementById('crm_date');
    if(dateInput) {
        dateInput.value = `${yyyy}-${mm}-${dd}`; // 예: 2026-01-07
    }

    // 2. 화면 보여주기
    showSection('section-crm-expiry');
    
    // 3. 자동 조회 시작
    loadExpiryList();
}

function loadExpiryList() {
    const branch = document.getElementById('crm_branch').value;
    const dateVal = document.getElementById('crm_date').value; // "2026-01-07"

    if(!dateVal) { alert("날짜를 선택해주세요."); return; }

    // ★ 날짜에서 '월(Month)' 정보만 추출해서 백엔드로 보냄
    // (이유: 개통은 보통 '월 단위'로 관리하므로, 해당 날짜가 속한 달을 조회하는 게 정확합니다)
    const month = dateVal.substring(0, 7); // "2026-01"

    // 로딩 표시
    document.getElementById('crm_tbody').innerHTML = `
        <tr style="height: 300px;">
            <td colspan="13" class="align-middle text-center">
                <div class="spinner-border text-success" role="status"></div>
                <div class="mt-2 small text-muted">
                    기준일: ${dateVal}<br>
                    고객 명단 분석 중...
                </div>
            </td>
        </tr>`;

    // API 호출 (기존 백엔드 그대로 사용 가능)
    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "get_expiry_candidates",
            branch: branch,
            targetDate: dateVal // ★ 이름도 targetDate로 변경 (예: "2026-01-07")
        })
    })
    .then(r => r.json())
    .then(d => {
        if(d.status === 'success') {
            renderCrmTable(d.list);
        } else {
            alert("조회 실패: " + d.message);
        }
    })
    .catch(e => {
        console.error(e);
        alert("통신 오류");
    });
}

// 1. 상태별 색상/텍스트 매핑 (관리하기 쉽게 분리)
const STATUS_CONFIG = {
    '대기': { class: 'bg-light text-secondary border-secondary', label: '대기' },
    '부재중': { class: 'bg-warning text-dark border-warning', label: '부재중' },
    '내방예약': { class: 'bg-primary text-white border-primary', label: '내방예약' },
    '보류': { class: 'bg-info text-dark border-info', label: '보류' },
    '거절': { class: 'bg-danger text-white border-danger', label: '거절' },
    '개통완료': { class: 'bg-success text-white border-success', label: '개통완료' }
};

function renderCrmTable(list) {
    const tbody = document.getElementById('crm_tbody');
    let html = "";

    if (list.length === 0) {
        html = `<tr><td colspan="13" class="py-5 text-muted">
            해당 날짜(18, 21, 24개월 전) 조회 결과가 없습니다.<br>
            <small>다른 날짜를 선택해보세요.</small>
        </td></tr>`;
        tbody.innerHTML = html;
        return;
    }

    list.forEach((item, index) => { // index 포함됨 (OK)
        
        // 1. 전화번호 마스킹
        let displayPhone = item.phone ? item.phone.replace(/^(\d{2,3})-?(\d{3,4})-?(\d{4})$/, "$1-****-$3") : '-';
        
        // 2. 생년월일 마스킹
        let displayBirth = String(item.birth || '-');
        if (displayBirth.length >= 6) {
             displayBirth = displayBirth.substring(0, 3) + "***";
        }

        // 3. 배지 디자인
        let badge = "";
        if (item.targetType === 24) badge = `<span class="badge rounded-pill bg-danger">24개월</span>`;
        else if (item.targetType === 21) badge = `<span class="badge rounded-pill bg-warning text-dark">21개월</span>`;
        else badge = `<span class="badge rounded-pill bg-success">18개월</span>`;

        // 4. 통화 버튼
        const callBtn = item.phone ? 
            `<a href="tel:${item.phone}" class="btn btn-outline-success btn-sm border-0">
                <i class="bi bi-telephone-fill"></i>
             </a>` : '-';

        // 5. 드롭다운 버튼 설정
        const currentStatus = item.crmStatus || '대기';
        // STATUS_CONFIG가 없으면 안전하게 기본값 처리
        const config = (typeof STATUS_CONFIG !== 'undefined' && STATUS_CONFIG[currentStatus]) 
                       ? STATUS_CONFIG[currentStatus] 
                       : { class: 'bg-light text-secondary border-secondary', label: currentStatus };
        
        const dropdownId = `dropdown_${index}`;
        const statusKeys = (typeof STATUS_CONFIG !== 'undefined') ? Object.keys(STATUS_CONFIG) : ['대기', '완료'];

        // ★ [핵심] data-bs-dismiss="dropdown" 속성 추가 (이게 있어야 클릭 시 닫힘)
        const dropdownHtml = `
            <div class="dropdown">
                <button class="btn btn-sm dropdown-toggle rounded-pill fw-bold small shadow-sm w-100 ${config.class}" 
                        type="button" id="${dropdownId}" data-bs-toggle="dropdown" aria-expanded="false"
                        style="min-width: 85px; height: 26px; padding: 0; line-height: 24px; font-size: 0.8rem;">
                    ${config.label}
                </button>
                <ul class="dropdown-menu text-center shadow-sm border-0" aria-labelledby="${dropdownId}" style="min-width: 85px;">
                    ${statusKeys.map(status => `
                        <li><a class="dropdown-item small fw-bold" href="#" 
                            data-bs-dismiss="dropdown"
                            onclick="changeCrmStatus('${dropdownId}', '${status}', '${item.branch}', '${item.phone}', '${item.openDate}')">
                            ${status}
                        </a></li>
                    `).join('')}
                </ul>
            </div>
        `;

        html += `
        <tr>
            <td>${badge}</td>
            <td class="fw-bold text-secondary">${item.branch}</td>
            <td>${item.openDate}</td>
            <td>${item.openPlace}</td>
            <td>${item.openType}</td>
            <td>${item.contractType}</td>
            <td class="fw-bold">${item.name}</td>
            <td class="fw-bold text-dark">${displayPhone}</td>
            <td class="text-secondary">${displayBirth}</td>
            <td class="text-primary fw-bold small">${item.model}</td>
            <td class="small">${item.plan}</td>
            <td>${callBtn}</td>
            <td style="vertical-align: middle;">${dropdownHtml}</td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

// ★ [신규] 상태 변경 시 자동 저장 함수
function changeCrmStatus(btnId, newStatus, branch, phone, date) {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    // 1. UI 즉시 반영 (버튼 텍스트 및 색상 변경)
    // STATUS_CONFIG가 함수 밖 전역 변수로 선언되어 있어야 합니다.
    const config = STATUS_CONFIG[newStatus] || { class: 'bg-light text-secondary', label: newStatus };
    
    // 기존 클래스 싹 지우고 새로 세팅
    btn.className = `btn btn-sm dropdown-toggle rounded-pill fw-bold small shadow-sm w-100 ${config.class}`;
    btn.innerText = config.label;

    // 2. ★ [핵심 해결] 드롭다운 강제로 닫기
    // Bootstrap의 공식 명령어를 사용하여 해당 버튼의 드롭다운을 숨깁니다.
    try {
        const dropdownInstance = bootstrap.Dropdown.getOrCreateInstance(btn);
        dropdownInstance.hide();
    } catch(e) {
        // 혹시라도 위 코드가 안 먹히면 원시적인 방법으로 클래스를 제거해서 닫습니다.
        btn.classList.remove('show');
        btn.setAttribute('aria-expanded', 'false');
        if (btn.nextElementSibling) {
            btn.nextElementSibling.classList.remove('show');
        }
    }
    
    // 3. 포커스 해제 (선택 후 버튼에 남아있는 테두리 잔상 제거)
    btn.blur();

    // 4. 서버 저장 요청
    fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({
            action: "update_crm_status",
            branch: branch,
            phone: phone,
            date: date,
            status: newStatus
        })
    })
    .then(r => r.json())
    .then(d => {
        if(d.status !== 'success') alert("저장 실패: " + d.message);
        else console.log("상태 저장 완료");
    })
    .catch(e => console.error(e));
}
