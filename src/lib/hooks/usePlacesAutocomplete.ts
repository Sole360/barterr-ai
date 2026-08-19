import { useCallback, useRef, useState } from "react";
import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

export interface ParsedAddress {
  street: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
}

export interface AddressSuggestion {
  label: string;
  placePrediction: google.maps.places.PlacePrediction;
}

setOptions({
  key: import.meta.env.VITE_GOOGLE_PLACES_KEY as string,
  v: "weekly",
});

let placesLibPromise: Promise<google.maps.PlacesLibrary> | null = null;
function getPlacesLib() {
  if (!placesLibPromise) {
    placesLibPromise = importLibrary("places") as Promise<google.maps.PlacesLibrary>;
  }
  return placesLibPromise;
}

function parseAddressComponents(
  components: google.maps.places.AddressComponent[]
): ParsedAddress {
  const get = (type: string) =>
    components.find((c) => c.types.includes(type))?.longText ?? "";
  const getShort = (type: string) =>
    components.find((c) => c.types.includes(type))?.shortText ?? "";

  return {
    street: [get("street_number"), get("route")].filter(Boolean).join(" "),
    street2: get("subpremise"),
    city: get("locality") || get("sublocality") || get("postal_town"),
    state: getShort("administrative_area_level_1"),
    zip: get("postal_code"),
  };
}

export function usePlacesAutocomplete(onSelect: (address: ParsedAddress) => void) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!input || input.length < 3) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const lib = await getPlacesLib();

        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new lib.AutocompleteSessionToken();
        }

        const { suggestions: results } =
          await lib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            sessionToken: sessionTokenRef.current,
            includedRegionCodes: ["us"],
          });

        setSuggestions(
          results
            .filter((s) => s.placePrediction)
            .map((s) => ({
              label: s.placePrediction!.text.toString(),
              placePrediction: s.placePrediction!,
            }))
        );
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, []);

  const selectSuggestion = useCallback(
    async (suggestion: AddressSuggestion) => {
      setSuggestions([]);
      setLoading(true);
      try {
        await getPlacesLib();
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({ fields: ["addressComponents"] });

        // Session is complete — reset token so next search starts a new session
        sessionTokenRef.current = null;

        if (place.addressComponents) {
          onSelect(parseAddressComponents(place.addressComponents));
        }
      } catch {
        // leave fields as-is if fetch fails
      } finally {
        setLoading(false);
      }
    },
    [onSelect]
  );

  const clearSuggestions = useCallback(() => setSuggestions([]), []);

  return { suggestions, loading, fetchSuggestions, selectSuggestion, clearSuggestions };
}
