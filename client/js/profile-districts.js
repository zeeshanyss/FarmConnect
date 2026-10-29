(function () {
  "use strict";

  // District choices can be expanded from a verified local dataset later.
  // Manual entry prevents users being blocked by incomplete data.
  const districtsByState = {};
  let locationDataPromise = null;

  function loadDistrictData() {
    if (!locationDataPromise) {
      locationDataPromise = fetch("/data/india_states_districts.json")
        .then(response => {
          if (!response.ok) throw new Error("District dataset unavailable");
          return response.json();
        })
        .then(states => {
          if (!Array.isArray(states)) throw new Error("Invalid district dataset");

          states.forEach(state => {
            if (!state.name || !Array.isArray(state.districts)) return;

            districtsByState[state.name] = state.districts
              .map(d => d.name)
              .filter(Boolean)
              .sort((a, b) => a.localeCompare(b));
          });
        });

      locationDataPromise.catch(() => {
        locationDataPromise = null;
      });
    }

    return locationDataPromise;
  }

  window.initProfileDistricts = function (savedState, savedDistrict) {
    const state = document.getElementById("pfState");
    const district = document.getElementById("pfDistrict");
    const custom = document.getElementById("pfDistrictCustom");

    if (!state || !district || !custom) return;

    function refresh(keepSaved) {
      const previous = keepSaved ? savedDistrict : "";
      const names = districtsByState[state.value] || [];

      district.innerHTML = "";

      const placeholder = new Option("Select district", "");
      district.add(placeholder);

      names.forEach(name => district.add(new Option(name, name)));

      if (previous && !names.includes(previous)) {
        district.add(new Option(previous + " (saved)", previous));
      }

      district.add(new Option("Other district - enter manually", "__custom"));

      district.value = previous || "";
      custom.style.display = "none";
      custom.required = false;
      custom.value = "";
    }

    state.addEventListener("change", () => {
      refresh(false);
      loadDistrictData()
        .then(() => refresh(false))
        .catch(error => {
          console.warn("Profile district dataset:", error.message);
        });
    });

    district.addEventListener("change", () => {
      const manual = district.value === "__custom";
      custom.style.display = manual ? "block" : "none";
      custom.required = manual;
      if (!manual) custom.value = "";
    });

    refresh(true);

    loadDistrictData()
      .then(() => refresh(true))
      .catch(error => {
        console.warn("Profile district dataset:", error.message);
      });

    // Convert manual district to the normal district field before profile saving.
    const form = document.getElementById("profileForm");
    if (form) {
      form.addEventListener("submit", event => {
        if (district.value !== "__custom") return;

        const value = custom.value.trim();

        if (!value || value.length > 80) {
          event.preventDefault();
          custom.setCustomValidity("Enter a valid district name.");
          custom.reportValidity();
          return;
        }

        custom.setCustomValidity("");
        district.add(new Option(value, value));
        district.value = value;
      }, true);
    }
  };
})();