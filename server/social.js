const crypto = require('crypto');
const db = require('./db');

// Helper to get user by username
async function getUserByUsername(username) {
  if (!username) return null;
  return await db.get('SELECT id, username, email, avatar_url FROM users WHERE LOWER(username) = LOWER(?)', [username.trim()]);
}

// Helper to get user by id
async function getUserById(id) {
  if (!id) return null;
  return await db.get('SELECT id, username, email, avatar_url FROM users WHERE id = ?', [id]);
}

// ───────── Friends Logic ─────────

// Send friend request
async function sendFriendRequest(requesterId, targetUsername) {
  const targetUser = await getUserByUsername(targetUsername);
  if (!targetUser) {
    throw new Error(`User "${targetUsername}" does not exist.`);
  }

  if (targetUser.id === requesterId) {
    throw new Error('You cannot add yourself as a friend.');
  }

  const existing = await db.get(`
    SELECT * FROM friends 
    WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)
  `, [requesterId, targetUser.id, targetUser.id, requesterId]);

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error(`You are already friends with ${targetUser.username}.`);
    }
    if (existing.status === 'pending') {
      if (existing.requester_id === requesterId) {
        throw new Error(`A friend request to ${targetUser.username} is already pending.`);
      } else {
        // Automatically accept if the other person already sent a request to you
        await db.run("UPDATE friends SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [existing.id]);
        return { message: `Accepted incoming friend request from ${targetUser.username}!`, friendship: existing };
      }
    }
  }

  const id = crypto.randomUUID();
  await db.run(`
    INSERT INTO friends (id, user_id_1, user_id_2, status, requester_id)
    VALUES (?, ?, ?, 'pending', ?)
  `, [id, requesterId, targetUser.id, requesterId]);

  return { message: `Friend request sent to ${targetUser.username}.`, id };
}

// Get overview of friends and pending requests
async function getFriendsOverview(userId) {
  // Accepted friends
  const acceptedRows = await db.all(`
    SELECT f.id AS friendship_id, f.created_at,
           CASE WHEN f.user_id_1 = ? THEN f.user_id_2 ELSE f.user_id_1 END AS friend_id
    FROM friends f
    WHERE (f.user_id_1 = ? OR f.user_id_2 = ?) AND f.status = 'accepted'
  `, [userId, userId, userId]);

  const friends = [];
  for (const row of acceptedRows) {
    const friend = await getUserById(row.friend_id);
    if (!friend) continue;

    // Check accountability partnership with this friend
    const partnership = await db.get(`
      SELECT * FROM accountability_partnerships
      WHERE ((requester_id = ? AND partner_id = ?) OR (requester_id = ? AND partner_id = ?))
        AND status IN ('pending', 'accepted')
    `, [userId, row.friend_id, row.friend_id, userId]);

    let accountabilityStatus = null;
    let canViewJournal = false;
    let partnershipId = null;

    if (partnership) {
      partnershipId = partnership.id;
      if (partnership.status === 'pending') {
        accountabilityStatus = partnership.requester_id === userId ? 'request_sent' : 'request_received';
      } else if (partnership.status === 'accepted') {
        accountabilityStatus = 'active';
        if (partnership.requester_id === row.friend_id) {
          canViewJournal = true;
        } else if (partnership.partner_shares_back === 1) {
          canViewJournal = true;
        }
      }
    }

    friends.push({
      friendshipId: row.friendship_id,
      id: friend.id,
      username: friend.username,
      avatarUrl: friend.avatar_url,
      accountabilityStatus,
      canViewJournal,
      partnershipId,
    });
  }

  // Incoming friend requests
  const incomingRows = await db.all(`
    SELECT f.id, f.created_at, u.id AS requester_id, u.username, u.avatar_url
    FROM friends f
    JOIN users u ON u.id = f.requester_id
    WHERE (f.user_id_1 = ? OR f.user_id_2 = ?) AND f.requester_id != ? AND f.status = 'pending'
  `, [userId, userId, userId]);

  // Incoming accountability requests
  const incomingAccountabilityRows = await db.all(`
    SELECT ap.id, ap.created_at, u.id AS requester_id, u.username, u.avatar_url
    FROM accountability_partnerships ap
    JOIN users u ON u.id = ap.requester_id
    WHERE ap.partner_id = ? AND ap.status = 'pending'
  `, [userId]);

  return {
    friends,
    incomingFriendRequests: incomingRows,
    incomingAccountabilityRequests: incomingAccountabilityRows,
  };
}

// Respond to friend request (accept or decline)
async function respondFriendRequest(userId, friendshipId, accept) {
  const rel = await db.get(`
    SELECT * FROM friends 
    WHERE id = ? AND (user_id_1 = ? OR user_id_2 = ?) AND requester_id != ? AND status = 'pending'
  `, [friendshipId, userId, userId, userId]);

  if (!rel) {
    throw new Error('Friend request not found or not authorized.');
  }

  if (accept) {
    await db.run("UPDATE friends SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [friendshipId]);
    return { message: 'Friend request accepted!' };
  } else {
    await db.run('DELETE FROM friends WHERE id = ?', [friendshipId]);
    return { message: 'Friend request declined.' };
  }
}

// Remove friend
async function removeFriend(userId, friendUserId) {
  await db.run(`
    DELETE FROM friends 
    WHERE (user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)
  `, [userId, friendUserId, friendUserId, userId]);

  // Also clean up any accountability partnerships between them
  await db.run(`
    DELETE FROM accountability_partnerships
    WHERE (requester_id = ? AND partner_id = ?) OR (requester_id = ? AND partner_id = ?)
  `, [userId, friendUserId, friendUserId, userId]);

  return { message: 'Friend removed.' };
}

// ───────── Accountability Logic ─────────

// Send accountability buddy request
async function sendAccountabilityRequest(requesterId, friendUsername) {
  const friend = await getUserByUsername(friendUsername);
  if (!friend) {
    throw new Error(`User "${friendUsername}" does not exist.`);
  }

  if (friend.id === requesterId) {
    throw new Error('You cannot request yourself as an accountability buddy.');
  }

  // Must be accepted friends first
  const isFriend = await db.get(`
    SELECT * FROM friends 
    WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?))
      AND status = 'accepted'
  `, [requesterId, friend.id, friend.id, requesterId]);

  if (!isFriend) {
    throw new Error(`You must be friends with ${friend.username} before requesting accountability.`);
  }

  // Check existing partnership
  const existing = await db.get(`
    SELECT * FROM accountability_partnerships
    WHERE (requester_id = ? AND partner_id = ?) OR (requester_id = ? AND partner_id = ?)
  `, [requesterId, friend.id, friend.id, requesterId]);

  if (existing) {
    if (existing.status === 'accepted') {
      throw new Error(`You already have an active accountability partnership with ${friend.username}.`);
    }
    if (existing.status === 'pending') {
      throw new Error(`An accountability request with ${friend.username} is already pending.`);
    }
  }

  const id = crypto.randomUUID();
  await db.run(`
    INSERT INTO accountability_partnerships (id, requester_id, partner_id, status, partner_shares_back)
    VALUES (?, ?, ?, 'pending', 0)
  `, [id, requesterId, friend.id]);

  return { message: `Accountability request sent to ${friend.username}.`, id };
}

// Respond to accountability request
async function respondAccountabilityRequest(partnerUserId, requestId, accept, shareBack = false) {
  const req = await db.get(`
    SELECT * FROM accountability_partnerships 
    WHERE id = ? AND partner_id = ? AND status = 'pending'
  `, [requestId, partnerUserId]);

  if (!req) {
    throw new Error('Accountability request not found or not authorized.');
  }

  if (accept) {
    const shareBackFlag = shareBack ? 1 : 0;
    await db.run(`
      UPDATE accountability_partnerships 
      SET status = 'accepted', partner_shares_back = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [shareBackFlag, requestId]);

    return { 
      message: shareBack 
        ? 'Accountability partnership accepted! Both of you can view each other’s full journals.' 
        : 'Accountability partnership accepted! You can now monitor their journal.',
      partnerSharesBack: Boolean(shareBackFlag)
    };
  } else {
    await db.run('DELETE FROM accountability_partnerships WHERE id = ?', [requestId]);
    return { message: 'Accountability request declined.' };
  }
}

// Remove accountability partnership
async function removeAccountabilityPartnership(userId, partnershipId) {
  const partnership = await db.get(`
    SELECT * FROM accountability_partnerships 
    WHERE id = ? AND (requester_id = ? OR partner_id = ?)
  `, [partnershipId, userId, userId]);

  if (!partnership) {
    throw new Error('Accountability partnership not found.');
  }

  await db.run('DELETE FROM accountability_partnerships WHERE id = ?', [partnershipId]);
  return { message: 'Accountability partnership ended.' };
}

// Fetch buddy's journal with strict authorization check
async function getBuddyJournal(viewerUserId, targetUserId) {
  if (viewerUserId === targetUserId) {
    throw new Error('Use the main journal endpoint for your own logs.');
  }

  const authPartner = await db.get(`
    SELECT * FROM accountability_partnerships
    WHERE status = 'accepted' AND (
      (requester_id = ? AND partner_id = ?)
      OR
      (requester_id = ? AND partner_id = ? AND partner_shares_back = 1)
    )
  `, [targetUserId, viewerUserId, viewerUserId, targetUserId]);

  if (!authPartner) {
    throw new Error('You do not have permission to view this user’s journal.');
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    throw new Error('Target user not found.');
  }

  const journalRow = await db.get('SELECT journal_data, updated_at FROM user_journals WHERE user_id = ?', [targetUserId]);
  let journal = null;
  if (journalRow && journalRow.journal_data) {
    try {
      journal = JSON.parse(journalRow.journal_data);
    } catch (e) {
      journal = null;
    }
  }

  return {
    user: {
      id: targetUser.id,
      username: targetUser.username,
      avatarUrl: targetUser.avatar_url,
    },
    journal: journal || { days: [], meta: {} },
    updatedAt: journalRow ? journalRow.updated_at : null,
  };
}

module.exports = {
  sendFriendRequest,
  getFriendsOverview,
  respondFriendRequest,
  removeFriend,
  sendAccountabilityRequest,
  respondAccountabilityRequest,
  removeAccountabilityPartnership,
  getBuddyJournal,
};
