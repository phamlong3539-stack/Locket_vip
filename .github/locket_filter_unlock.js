/**
 * Locket Camera VIP / Gold Unlock Script (MITM Rewrite)
 * Hỗ trợ các app proxy: Quantumult X, Surge, Loon, Shadowrocket
 */

const WORKER_HOST = 'https://locket-vip.mhiep20077.workers.dev';
const VIP_STORE_KEY = 'LOCKET_VIP_COMMUNITY';
const SELF_UID_KEY = 'LOCKET_SELF_UID';
const SELF_USERNAME_KEY = 'LOCKET_SELF_USERNAME';

const BASE_VIP_USERS = [
  'mhhiep',
  '2c7dlquxuqulknrwgpcqsqlw0sk2',
  'th_quang08',
  'th_quang',
  'nln9pozfecsccxhuqpiwvkhfwsi2',
  'mhhuyz',
  '7tulqjjxb0srwqbbp3euildiqfe3',
  'nguyentuankietne',
  'blgpf4fdvbbnlmfllziy4hnbjjn1'
];

/**
 * Gán các thuộc tính huy hiệu Gold cho đối tượng mục tiêu (đệ quy nếu có user/friend/profile lồng nhau)
 */
function applyGoldBadge(target) {
  if (!target || typeof target !== 'object') return;

  target.badge = 'locket_gold';
  target.badge_tier = 'gold';
  target.show_badge = true;
  target.is_gold = true;
  target.has_gold = true;
  target.gold = true;
  target.gold_subscription = true;
  target.has_gold_subscription = true;
  target.tier = 'gold';
  target.subscription_status = 'active';

  if (target.user && typeof target.user === 'object' && target.user !== target) {
    applyGoldBadge(target.user);
  }
  if (target.friend && typeof target.friend === 'object' && target.friend !== target) {
    applyGoldBadge(target.friend);
  }
  if (target.profile && typeof target.profile === 'object' && target.profile !== target) {
    applyGoldBadge(target.profile);
  }
}

/**
 * Kiểm tra xem một đối tượng có thuộc danh sách VIP hay không dựa vào UID/Username/Tên hiển thị
 */
function isNodeVip(node, vipSet) {
  if (!node || typeof node !== 'object') return false;

  const candidateUid = String(
    node.uid ||
    node.user_id ||
    node.id ||
    node.friend_uid ||
    node.friend_id ||
    node.friendId ||
    node.userId ||
    ''
  ).toLowerCase().trim();

  if (candidateUid && vipSet.has(candidateUid)) return true;

  const candidateUsername = String(
    node.username ||
    node.friend_username ||
    ''
  ).toLowerCase().trim();

  if (candidateUsername && vipSet.has(candidateUsername)) return true;

  if (node.user && typeof node.user === 'object') {
    const userUid = String(
      node.user.uid ||
      node.user.id ||
      node.user.user_id ||
      ''
    ).toLowerCase().trim();
    if (userUid && vipSet.has(userUid)) return true;

    const userUsername = String(
      node.user.username ||
      node.user.friend_username ||
      ''
    ).toLowerCase().trim();
    if (userUsername && vipSet.has(userUsername)) return true;
  }

  if (node.friend && typeof node.friend === 'object') {
    const friendUid = String(
      node.friend.uid ||
      node.friend.id ||
      ''
    ).toLowerCase().trim();
    if (friendUid && vipSet.has(friendUid)) return true;

    const friendUsername = String(
      node.friend.username ||
      ''
    ).toLowerCase().trim();
    if (friendUsername && vipSet.has(friendUsername)) return true;
  }

  const candidateName = String(
    node.display_name ||
    node.first_name ||
    node.name ||
    (node.user && (node.user.display_name || node.user.first_name)) ||
    ''
  ).toLowerCase().trim();

  if (candidateName && vipSet.has(candidateName)) return true;

  return false;
}

// =========================================================================
// XỬ LÝ REQUEST ($response chưa tồn tại)
// =========================================================================
if (typeof $response === 'undefined') {
  const reqUrl = (typeof $request !== 'undefined' && $request.url) ? $request.url : '';

  // Giả lập phản hồi thành công khi cập nhật thông tin hồ sơ
  if (reqUrl.includes('changeProfileInfo')) {
    const mockHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    };
    const mockPayload = {
      badge: 'locket_gold',
      badge_tier: 'gold',
      is_gold: true,
      success: true
    };

    $done({
      response: {
        status: 200,
        headers: mockHeaders,
        body: JSON.stringify({
          data: mockPayload,
          result: mockPayload
        })
      }
    });
    return;
  }

  // Loại bỏ các header cache để buộc server trả dữ liệu đầy đủ
  let reqHeaders = Object.assign({}, ($request && $request.headers) || {});
  const headersToRemove = ['if-none-match', 'if-modified-since', 'x-revenuecat-etag'];
  for (let k of Object.keys(reqHeaders)) {
    if (headersToRemove.includes(k.toLowerCase())) {
      delete reqHeaders[k];
    }
  }

  $done({ headers: reqHeaders });
}

// =========================================================================
// XỬ LÝ RESPONSE ($response đã có dữ liệu từ máy chủ)
// =========================================================================
else {
  const reqUrl = (typeof $request !== 'undefined' && $request.url) ? $request.url : '';

  if (reqUrl.includes('generateFilteredImage')) {
    $done({});
    return;
  }

  let body = $response.body;
  let status = $response.status || $response.statusCode || 200;

  const customArg = (typeof $argument === 'string' && $argument.trim()) ? $argument.trim().toLowerCase() : '';
  const unlockAllFriends = customArg.includes('all_friends=true') || customArg.includes('gold_all=true');

  let vipSet = new Set(
    BASE_VIP_USERS.map(user => String(user).toLowerCase().trim())
  );

  /**
   * Trích xuất UID người dùng hiện tại từ chuỗi JWT trong Authorization header
   */
  function extractSelfUidFromHeaders(headers) {
    if (!headers || typeof headers !== 'object') return null;

    const authHeader = headers['authorization'] || headers['Authorization'] || headers['AUTHORIZATION'] || '';
    if (!authHeader || typeof authHeader !== 'string') return null;

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const tokenParts = token.split('.');
    if (tokenParts.length >= 2) {
      try {
        let base64Payload = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (base64Payload.length % 4) {
          base64Payload += '=';
        }

        let decodedPayload = '';
        const cleanPayload = String(base64Payload).replace(/=+$/, '');
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

        for (
          let bitCount = 0, buffer, charIndex, i = 0;
          (charIndex = cleanPayload.charAt(i++));
          ~charIndex &&
          ((buffer = bitCount % 4 ? buffer * 64 + charIndex : charIndex), bitCount++ % 4)
            ? (decodedPayload += String.fromCharCode(255 & (buffer >> ((-2 * bitCount) & 6))))
            : 0
        ) {
          charIndex = alphabet.indexOf(charIndex);
        }

        if (decodedPayload) {
          const payloadObj = JSON.parse(decodedPayload);
          return payloadObj.user_id || payloadObj.sub || payloadObj.uid || null;
        }
      } catch (err) {}
    }
    return null;
  }

  const reqHeaders = (typeof $request !== 'undefined' && $request && $request.headers) ? $request.headers : {};
  const jwtSelfUid = extractSelfUidFromHeaders(reqHeaders);

  // Lấy UID cá nhân từ persistent store hoặc từ JWT
  let myUid = typeof $persistentStore !== 'undefined' ? $persistentStore.read(SELF_UID_KEY) : null;
  if (jwtSelfUid) {
    myUid = jwtSelfUid;
    if (typeof $persistentStore !== 'undefined') {
      $persistentStore.write(myUid, SELF_UID_KEY);
    }
  }
  if (myUid) {
    vipSet.add(String(myUid).toLowerCase().trim());
  }

  // Lấy Username cá nhân từ store
  const myUname = typeof $persistentStore !== 'undefined' ? $persistentStore.read(SELF_USERNAME_KEY) : null;
  if (myUname) {
    vipSet.add(String(myUname).toLowerCase().trim());
  }

  // Nạp danh sách VIP mở rộng từ store
  if (typeof $persistentStore !== 'undefined') {
    try {
      const rawVip = $persistentStore.read(VIP_STORE_KEY);
      if (rawVip) {
        const communityList = JSON.parse(rawVip);
        if (Array.isArray(communityList)) {
          for (let id of communityList) {
            if (id) vipSet.add(String(id).toLowerCase().trim());
          }
        }
      }
    } catch (err) {}
  }

  if (body && typeof body === 'string') {
    try {
      let obj = JSON.parse(body);
      const isFriendsOrFeed = /getFriends|getUsers|fetchFriends|getRecipients|recipients|moments|fetchMoments|getMoments|contacts/i.test(reqUrl);

      // Bypass lỗi thanh toán 400/402/403 cho tính năng sinh ảnh bộ lọc
      if (!isFriendsOrFeed && (status === 402 || status === 403 || status === 400)) {
        status = 200;
        if (obj && obj.error && reqUrl.includes('generateFilteredImage')) {
          obj = {
            result: {
              status: 200,
              is_gold: true,
              is_locked: false,
              requires_gold: false,
              unlocked: true,
              data: (obj.error && obj.error.details) || {}
            }
          };
        }
      }

      /**
       * Mở khóa đầy đủ quyền VIP cho chính tài khoản người dùng hiện tại
       */
      function unlockSelfUser(userObj) {
        if (!userObj || typeof userObj !== 'object') return;

        applyGoldBadge(userObj);
        userObj.can_use_filters = true;
        userObj.can_use_gold_features = true;
        userObj.can_generate_filtered_image = true;
        userObj.can_create_filtered_image = true;
        userObj.has_ai_access = true;
        userObj.filter_access = true;

        const targetUser = (userObj.user && typeof userObj.user === 'object') ? userObj.user : userObj;
        const currentUid = String(
          targetUser.uid ||
          targetUser.user_id ||
          targetUser.id ||
          userObj.uid ||
          userObj.user_id ||
          userObj.id ||
          myUid ||
          ''
        ).toLowerCase().trim();

        const currentUsername = String(
          targetUser.username ||
          userObj.username ||
          ''
        ).toLowerCase().trim();

        if (typeof $persistentStore !== 'undefined') {
          if (currentUid) $persistentStore.write(currentUid, SELF_UID_KEY);
          if (currentUsername) $persistentStore.write(currentUsername, SELF_USERNAME_KEY);
        }

        if (currentUid) vipSet.add(currentUid);
        if (currentUsername) vipSet.add(currentUsername);

        // Gửi UID/Username lên Worker server
        if ((currentUid || currentUsername) && typeof $httpClient !== 'undefined') {
          try {
            $httpClient.get(
              WORKER_HOST + '/api/register-vip?uid=' + encodeURIComponent(currentUid) + '&username=' + encodeURIComponent(currentUsername),
              function () {}
            );
          } catch (err) {}
        }

        // Định kỳ gửi API đồng bộ profile (tối đa 1 lần mỗi giờ = 3,600,000 ms)
        const authToken = reqHeaders['authorization'] || reqHeaders['Authorization'];
        if (authToken && typeof $httpClient !== 'undefined') {
          const lastSyncTime = typeof $persistentStore !== 'undefined' ? $persistentStore.read('LOCKET_PROFILE_SYNCED') : null;
          const now = Date.now();

          if (!lastSyncTime || now - Number(lastSyncTime) > 3600000) {
            if (typeof $persistentStore !== 'undefined') {
              $persistentStore.write(String(now), 'LOCKET_PROFILE_SYNCED');
            }
            try {
              $httpClient.post(
                {
                  url: 'https://api.locketcamera.com/changeProfileInfo',
                  headers: {
                    Authorization: authToken,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    data: {
                      badge: 'locket_gold'
                    }
                  })
                },
                function () {}
              );
            } catch (err) {}
          }
        }
      }

      // Nhận diện xem response có phải trang hồ sơ người dùng đơn lẻ không
      const isSingleUserProfile = Boolean(
        !isFriendsOrFeed &&
        (
          (obj && obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) && (obj.data.email || (myUid && obj.data.uid === myUid))) ||
          (obj && obj.result && typeof obj.result === 'object' && !Array.isArray(obj.result) && (obj.result.email || (myUid && obj.result.uid === myUid))) ||
          (obj && obj.user && typeof obj.user === 'object' && !Array.isArray(obj.user) && (obj.user.email || (myUid && obj.user.uid === myUid)))
        )
      );

      if (isSingleUserProfile) {
        applyGoldBadge(obj);
        unlockSelfUser(obj.data || obj.result || obj.user || obj);
      }

      /**
       * Duyệt đệ quy cây JSON để xóa hạn chế paywall, mở khóa tính năng và gán ảnh rõ nét
       */
      function transformNode(node) {
        if (!node || typeof node !== 'object') return;

        if (Array.isArray(node)) {
          for (let i = 0; i < node.length; i++) {
            transformNode(node[i]);
          }
          return;
        }

        const userObj = (node.user && typeof node.user === 'object') ? node.user : node;
        const nodeId = String(
          userObj.uid ||
          userObj.user_id ||
          userObj.id ||
          node.uid ||
          node.user_id ||
          node.id ||
          ''
        ).toLowerCase().trim();

        // Kiểm tra xem đối tượng node này có đại diện cho chính bản thân người dùng không
        const isSelf = Boolean(
          (myUid && nodeId && nodeId === myUid.toLowerCase()) ||
          ('email' in node && node.email && typeof node.email === 'string' && node.email.includes('@')) ||
          ('push_token' in node && node.push_token) ||
          ('fcm_token' in node && node.fcm_token)
        );

        if (isSelf) {
          unlockSelfUser(node);
        } else {
          const isVip = unlockAllFriends || isNodeVip(node, vipSet);
          if (isVip) {
            applyGoldBadge(node);
            if (node.user && typeof node.user === 'object') applyGoldBadge(node.user);
            if (node.friend && typeof node.friend === 'object') applyGoldBadge(node.friend);
          }
        }

        // Tắt toàn bộ các cờ hạn chế / khóa
        const falseProperties = [
          'is_locked',
          'locked',
          'requires_gold',
          'require_gold',
          'gold_only',
          'is_gold_only',
          'paywall',
          'show_paywall',
          'show_upsell',
          'upsell',
          'blurred',
          'is_blurred',
          'needs_gold'
        ];
        for (let prop of falseProperties) {
          if (prop in node) {
            node[prop] = false;
          }
        }

        // Bật toàn bộ các cờ quyền lợi / mở khóa
        const trueProperties = [
          'can_view',
          'unlocked',
          'is_unlocked',
          'is_free',
          'free',
          'can_use_filter',
          'allowed',
          'can_use_filters'
        ];
        for (let prop of trueProperties) {
          if (prop in node) {
            node[prop] = true;
          }
        }

        // Bỏ làm mờ ảnh (chuyển URL ảnh mờ thành URL ảnh gốc độ phân giải cao)
        const unblurredUrl =
          node.unblurred_url ||
          node.unlocked_url ||
          node.result_url ||
          node.image_url ||
          node.transformed_image_url ||
          node.url;

        if (unblurredUrl && typeof unblurredUrl === 'string' && unblurredUrl.startsWith('http')) {
          if ('blurred_url' in node) node.blurred_url = unblurredUrl;
          if ('blurred_image_url' in node) node.blurred_image_url = unblurredUrl;
          if ('preview_url' in node && node.is_blurred) node.preview_url = unblurredUrl;
        }

        // Duyệt tiếp các thuộc tính con (bỏ qua các thuộc tính trạng thái Gold cơ bản)
        for (let key of Object.keys(node)) {
          if (
            key !== 'badge' &&
            key !== 'is_gold' &&
            key !== 'has_gold' &&
            key !== 'tier' &&
            key !== 'gold'
          ) {
            if (vipSet.has(key.toLowerCase().trim()) && node[key] && typeof node[key] === 'object') {
              applyGoldBadge(node[key]);
            }
            transformNode(node[key]);
          }
        }
      }

      transformNode(obj);
      body = JSON.stringify(obj);
    } catch (err) {}
  }

  // Tải danh sách cộng đồng VIP mới nhất từ Cloudflare Worker trong nền
  if (typeof $httpClient !== 'undefined') {
    try {
      $httpClient.get(WORKER_HOST + '/api/vip-users', function (err, res, resData) {
        if (!err && resData) {
          try {
            const parsed = JSON.parse(resData);
            if (parsed && Array.isArray(parsed.identifiers) && typeof $persistentStore !== 'undefined') {
              $persistentStore.write(JSON.stringify(parsed.identifiers), VIP_STORE_KEY);
            }
          } catch (e) {}
        }
      });
    } catch (err) {}
  }

  // Xóa các header mã hóa nén và kích thước gói tin cũ để tránh xung đột sau khi chỉnh sửa body
  let respHeaders = Object.assign({}, ($response && $response.headers) || {});
  delete respHeaders['Content-Encoding'];
  delete respHeaders['content-encoding'];
  delete respHeaders['Content-Length'];
  delete respHeaders['content-length'];
  delete respHeaders['Transfer-Encoding'];
  delete respHeaders['transfer-encoding'];
  respHeaders['content-type'] = 'application/json; charset=utf-8';

  $done({
    status,
    headers: respHeaders,
    body
  });
}
