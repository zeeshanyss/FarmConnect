
const router = require("express").Router();

const { db } = require("../config/firebase");
const Listing = require("../models/Listing");
const Bid = require("../models/Bid");
const User = require("../models/User");

const { requireAuth, requireRole } = require("../middleware/auth");
const { fairPriceModel } = require("../utils/fairPriceModel");

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

async function publicFarmer(id) {
  const user = await User.findById(id);

  if (!user) return null;

  return {
    _id: user._id,
    name: user.name,
    village: user.village,
    district: user.district,
    trust: user.trust,
  };
}

async function publicBuyer(id) {
  const user = await User.findById(id);

  if (!user) return null;

  return {
    _id: user._id,
    name: user.name,
    trust: user.trust,
  };
}

module.exports = (io) => {
  // Browse listings
  router.get("/", async (req, res) => {
    try {
      const { crop, status = "open", limit = 40 } = req.query;

      const query = { status };
      if (crop) query.crop = crop;

      let listings = await Listing.find(query);

      listings = newestFirst(listings).slice(
        0,
        Math.min(200, Math.max(1, Number(limit) || 40))
      );

      const result = await Promise.all(
        listings.map(async (listing) => ({
          ...listing,
          farmer: await publicFarmer(listing.farmer),
        }))
      );

      res.json(result);
    } catch (error) {
      console.error("Browse listings error:", error);
      res.status(500).json({ error: "Could not load listings" });
    }
  });

  // Post a listing
  router.post("/", requireAuth, requireRole("farmer"), async (req, res) => {
    try {
      const {
        crop,
        variety,
        quantityQuintals,
        askingPricePerQuintal,
        grade,
        harvestDate,
        location,
      } = req.body;

      const model = await fairPriceModel(crop, {
        state: req.user.state,
      });

      const listing = await Listing.create({
        farmer: req.user.id,
        crop,
        variety,
        quantityQuintals,
        askingPricePerQuintal,
        grade,
        harvestDate,
        location,
        priceModelSnapshot: {
          suggestedFair: model.fair,
          low: model.low,
          high: model.high,
          confidence: model.confidence,
        },
      });

      const populated = {
        ...listing,
        farmer: await publicFarmer(listing.farmer),
      };

      io.emit("listing:new", populated);
      res.status(201).json(populated);
    } catch (error) {
      console.error("Create listing error:", error);
      res.status(500).json({ error: "Could not create listing" });
    }
  });

  // Withdraw a listing
  router.patch("/:id/withdraw", requireAuth, async (req, res) => {
    try {
      const listing = await Listing.findById(req.params.id);

      if (!listing || listing.farmer !== req.user.id) {
        return res.status(404).json({ error: "Listing not found" });
      }

      const updated = await Listing.findByIdAndUpdate(listing._id, {
        status: "withdrawn",
      });

      io.emit("listing:updated", updated);
      res.json(updated);
    } catch (error) {
      console.error("Withdraw listing error:", error);
      res.status(500).json({ error: "Could not withdraw listing" });
    }
  });

  // View bids for a listing
  router.get("/:id/bids", async (req, res) => {
    try {
      const bids = newestFirst(
        await Bid.find({ listing: req.params.id })
      );

      const result = await Promise.all(
        bids.map(async (bid) => ({
          ...bid,
          buyer: await publicBuyer(bid.buyer),
        }))
      );

      res.json(result);
    } catch (error) {
      console.error("Load bids error:", error);
      res.status(500).json({ error: "Could not load bids" });
    }
  });

  // Place a bid
  router.post(
    "/:id/bids",
    requireAuth,
    requireRole("buyer"),
    async (req, res) => {
      try {
        const listing = await Listing.findById(req.params.id);

        if (!listing || listing.status !== "open") {
          return res.status(400).json({
            error: "Listing is not open for bids",
          });
        }

        const amount = Number(req.body.amountPerQuintal);

        const bid = await Bid.create({
          listing: listing._id,
          buyer: req.user.id,
          amountPerQuintal: amount,
          message: req.body.message,
        });

        const populated = {
          ...bid,
          buyer: await publicBuyer(bid.buyer),
        };

        io.to(`listing:${listing._id}`).emit("bid:new", populated);
        io.emit("activity:pulse", {
          text: `${req.user.name} bid on ${listing.crop}`,
        });

        res.status(201).json(populated);
      } catch (error) {
        console.error("Place bid error:", error);
        res.status(500).json({ error: "Could not place bid" });
      }
    }
  );

  // Accept a bid
  router.patch(
    "/:id/bids/:bidId/accept",
    requireAuth,
    requireRole("farmer"),
    async (req, res) => {
      try {
        const listing = await Listing.findById(req.params.id);

        if (!listing || listing.farmer !== req.user.id) {
          return res.status(404).json({
            error: "Listing not found",
          });
        }

        if (listing.status !== "open") {
          return res.status(400).json({
            error: "Listing is not open for bids",
          });
        }

        const bid = await Bid.findById(req.params.bidId);

        if (
          !bid ||
          bid.listing !== listing._id ||
          bid.status !== "pending"
        ) {
          return res.status(404).json({
            error: "Pending bid not found for this listing",
          });
        }

        const updatedBid = await Bid.findByIdAndUpdate(bid._id, {
          status: "accepted",
        });

        const updatedListing = await Listing.findByIdAndUpdate(
          listing._id,
          {
            status: "sold",
            soldTo: bid.buyer,
            soldPricePerQuintal: bid.amountPerQuintal,
          }
        );

        // Reject the other pending bids for this listing.
        const otherBids = await Bid.find({ listing: listing._id });

        await Promise.all(
          otherBids
            .filter(
              (otherBid) =>
                otherBid._id !== bid._id &&
                otherBid.status === "pending"
            )
            .map((otherBid) =>
              Bid.findByIdAndUpdate(otherBid._id, {
                status: "rejected",
              })
            )
        );

        io.emit("listing:updated", updatedListing);
        io.to(`listing:${listing._id}`).emit("bid:accepted", updatedBid);

        res.json({
          listing: updatedListing,
          bid: updatedBid,
        });
      } catch (error) {
        console.error("Accept bid error:", error);
        res.status(500).json({ error: "Could not accept bid" });
      }
    }
  );

  return router;
};
