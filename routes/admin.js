
const router = require("express").Router();

const { db } = require("../config/firebase");
const User = require("../models/User");
const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const Review = require("../models/Review");
const AuditLog = require("../models/AuditLog");

const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin"));

function publicUser(user) {
  if (!user) return null;

  const data = { ...user };
  delete data.passwordHash;
  delete data.refreshTokenHash;

  return data;
}

function newestFirst(items) {
  return items.sort((a, b) => {
    const dateA = a.createdAt?.toDate
      ? a.createdAt.toDate()
      : new Date(a.createdAt || 0);

    const dateB = b.createdAt?.toDate
      ? b.createdAt.toDate()
      : new Date(b.createdAt || 0);

    return dateB - dateA;
  });
}

router.get("/stats", async (req, res) => {
  try {
    const [
      users,
      listings,
      bids,
      reviews,
    ] = await Promise.all([
      User.find(),
      Listing.find(),
      Bid.find(),
      Review.find(),
    ]);

    res.json({
      userCount: users.length,
      farmerCount: users.filter((u) => u.role === "farmer").length,
      buyerCount: users.filter((u) => u.role === "buyer").length,
      listingCount: listings.length,
      openListings: listings.filter((l) => l.status === "open").length,
      bidCount: bids.length,
      reviewCount: reviews.length,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    res.status(500).json({ error: "Failed to load admin statistics" });
  }
});

router.get("/users", async (req, res) => {
  try {
    const { q, role, limit = 100 } = req.query;

    let users = await User.find(role ? { role } : {});

    if (q) {
      const search = String(q).toLowerCase();

      users = users.filter(
        (user) =>
          String(user.name || "").toLowerCase().includes(search) ||
          String(user.phone || "").toLowerCase().includes(search)
      );
    }

    users = newestFirst(users).slice(
      0,
      Math.min(200, Math.max(1, Number(limit) || 100))
    );

    res.json(users.map(publicUser));
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ error: "Failed to load users" });
  }
});

router.patch("/users/:id/verify", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, {
      isVerified: true,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await AuditLog.create({
      event: "admin_verify_user",
      actor: req.user.id,
      target: req.params.id,
      ip: req.ip,
    });

    res.json(publicUser(user));
  } catch (error) {
    console.error("Verify user error:", error);
    res.status(500).json({ error: "Failed to verify user" });
  }
});

router.patch("/users/:id/suspend", async (req, res) => {
  try {
    const { suspend = true } = req.body;

    const user = await User.findByIdAndUpdate(req.params.id, {
      isActive: !suspend,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await AuditLog.create({
      event: suspend ? "admin_suspend_user" : "admin_unsuspend_user",
      actor: req.user.id,
      target: req.params.id,
      ip: req.ip,
    });

    res.json(publicUser(user));
  } catch (error) {
    console.error("Suspend user error:", error);
    res.status(500).json({ error: "Failed to update user status" });
  }
});

router.get("/listings", async (req, res) => {
  try {
    const listings = newestFirst(await Listing.find()).slice(0, 200);

    const result = await Promise.all(
      listings.map(async (listing) => {
        const farmer = await User.findById(listing.farmer);

        return {
          ...listing,
          farmer: farmer
            ? {
                _id: farmer._id,
                name: farmer.name,
                phone: farmer.phone,
              }
            : null,
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error("Admin listings error:", error);
    res.status(500).json({ error: "Failed to load listings" });
  }
});

router.get("/bids", async (req, res) => {
  try {
    const bids = newestFirst(await Bid.find()).slice(0, 200);

    const result = await Promise.all(
      bids.map(async (bid) => {
        const [buyer, listing] = await Promise.all([
          User.findById(bid.buyer),
          Listing.findById(bid.listing),
        ]);

        return {
          ...bid,
          buyer: buyer
            ? { _id: buyer._id, name: buyer.name, phone: buyer.phone }
            : null,
          listing: listing
            ? { _id: listing._id, crop: listing.crop }
            : null,
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error("Admin bids error:", error);
    res.status(500).json({ error: "Failed to load bids" });
  }
});

router.get("/reviews", async (req, res) => {
  try {
    const reviews = newestFirst(await Review.find()).slice(0, 200);

    const result = await Promise.all(
      reviews.map(async (review) => {
        const [author, target] = await Promise.all([
          User.findById(review.author),
          User.findById(review.target),
        ]);

        return {
          ...review,
          author: author ? { _id: author._id, name: author.name } : null,
          target: target ? { _id: target._id, name: target.name } : null,
        };
      })
    );

    res.json(result);
  } catch (error) {
    console.error("Admin reviews error:", error);
    res.status(500).json({ error: "Failed to load reviews" });
  }
});

router.get("/audit-log", async (req, res) => {
  try {
    const snapshot = await db
      .collection("auditLogs")
      .orderBy("createdAt", "desc")
      .limit(300)
      .get();

    const logs = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const log = { id: doc.id, ...doc.data() };

        const [actor, target] = await Promise.all([
          log.actor ? User.findById(log.actor) : null,
          log.target ? User.findById(log.target) : null,
        ]);

        return {
          ...log,
          actor: actor
            ? { _id: actor._id, name: actor.name, role: actor.role }
            : null,
          target: target
            ? { _id: target._id, name: target.name, role: target.role }
            : null,
        };
      })
    );

    res.json(logs);
  } catch (error) {
    console.error("Admin audit log error:", error);
    res.status(500).json({ error: "Failed to load audit logs" });
  }
});

module.exports = router;
