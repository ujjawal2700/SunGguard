import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Package,
  History,
  Clock,
  User,
  Phone,
  ChevronLeft,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { parcelApi } from '../services/parcelApi';
import { getOrderSocket, onParcelStatusUpdate } from '@/core/services/orderSocket';
import { createSocketTokenReader } from '@core/utils/authStorage';
import { STORAGE_KEYS } from '@core/utils/storage';
import { GoogleMap, Marker, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import ParcelReviewPrompt from '../components/parcel/ParcelReviewPrompt';

const getCustomerToken = createSocketTokenReader(STORAGE_KEYS.AUTH_CUSTOMER);

const formatParcelStatusLabel = (status) => {
  if (status === 'SEARCHING') return 'Searching for rider';
  if (status === 'REQUESTED') return 'Waiting for rider';
  return status;
};

const libraries = ['places'];

const TO_PICKUP_STATUSES = new Set(["ACCEPTED", "RIDER_ASSIGNED", "PICKUP_REACHED"]);

const LiveTrackingMap = ({ pickupAddress, deliveryPartner, status }) => {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries,
  });

  const [directions, setDirections] = useState(null);
  const mapRef = useRef(null);

  const pickupPos =
    pickupAddress?.lat != null && pickupAddress?.lng != null
      ? { lat: Number(pickupAddress.lat), lng: Number(pickupAddress.lng) }
      : null;

  const trackingActive = TO_PICKUP_STATUSES.has(status) || status === 'REQUESTED' || status === 'SEARCHING';

  const riderCoordinates = deliveryPartner?.location?.coordinates;
  const riderPos =
    trackingActive &&
    Array.isArray(riderCoordinates) &&
    riderCoordinates.length === 2
      ? { lat: Number(riderCoordinates[1]), lng: Number(riderCoordinates[0]) }
      : null;

  useEffect(() => {
    if (!isLoaded || !window.google || !riderPos || !pickupPos || !trackingActive) {
      setDirections(null);
      return;
    }

    const directionsService = new window.google.maps.DirectionsService();
    let cancelled = false;
    directionsService.route(
      {
        origin: riderPos,
        destination: pickupPos,
        travelMode: window.google.maps.TravelMode.DRIVING,
      },
      (result, statusCode) => {
        if (cancelled) return;
        if (statusCode === window.google.maps.DirectionsStatus.OK) {
          setDirections(result);
        } else {
          setDirections(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [isLoaded, riderPos?.lat, riderPos?.lng, pickupPos?.lat, pickupPos?.lng, trackingActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    const points = [pickupPos, riderPos].filter(Boolean);
    if (!points.length) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);
  }, [pickupPos?.lat, pickupPos?.lng, riderPos?.lat, riderPos?.lng]);

  if (!isLoaded) {
    return (
      <div className="h-64 md:h-80 w-full bg-slate-100 rounded-3xl flex items-center justify-center animate-pulse">
        <span className="text-xs text-slate-400 font-bold">Loading Live Map...</span>
      </div>
    );
  }

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false,
  };

  const center = pickupPos || { lat: 22.7196, lng: 75.8577 };

  return (
    <div className="rounded-3xl overflow-hidden border border-slate-100 shadow-md relative h-64 md:h-80 w-full z-10">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={14}
        onLoad={(map) => {
          mapRef.current = map;
        }}
        options={mapOptions}
      >
        {directions && trackingActive && (
          <DirectionsRenderer
            directions={directions}
            options={{
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: '#2563eb',
                strokeOpacity: 0.95,
                strokeWeight: 5,
              },
            }}
          />
        )}

        {pickupPos && (
          <Marker
            position={pickupPos}
            label={{
              text: 'You',
              color: 'white',
              fontWeight: 'black',
            }}
            title={`Pickup: ${pickupAddress.fullAddress}`}
          />
        )}

        {riderPos && (
          <Marker
            position={riderPos}
            icon={{
              path: window.google.maps.SymbolPath.CIRCLE,
              scale: 9,
              fillColor: '#ea580c',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
            title={`Rider: ${deliveryPartner?.name || 'Captain'}`}
          />
        )}
      </GoogleMap>
    </div>
  );
};

const ParcelHistoryPage = () => {
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trackingParcel, setTrackingParcel] = useState(null);
  const [requestingLateRefund, setRequestingLateRefund] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      const response = await parcelApi.getHistory();
      if (response.data && response.data.success) {
        setHistory(response.data.results || response.data.result || []);
      }
    } catch (error) {
      console.error('Failed to load history', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleTrackParcel = async (id) => {
    try {
      const response = await parcelApi.trackParcel(id);
      if (response.data && response.data.success) {
        setTrackingParcel(response.data.result);
      } else {
        toast.error('Could not fetch tracking details');
      }
    } catch (error) {
      toast.error('Tracking request failed');
    }
  };

  const trackingId = trackingParcel?._id ? String(trackingParcel._id) : null;
  const trackingStatus = trackingParcel?.status;
  const isTerminalTracking =
    trackingStatus === 'DELIVERED' || trackingStatus === 'CANCELLED';

  // Backup poll only — do not depend on full parcel object (that restarts the timer
  // on every response and causes repeated /parcel/track calls).
  useEffect(() => {
    if (!trackingId || isTerminalTracking) return undefined;

    const interval = setInterval(async () => {
      try {
        const response = await parcelApi.trackParcel(trackingId);
        if (response.data && response.data.success) {
          setTrackingParcel(response.data.result);
        }
      } catch (err) {
        console.error('Failed to poll tracking status', err);
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [trackingId, isTerminalTracking]);

  useEffect(() => {
    if (!trackingId) return undefined;
    const getToken = getCustomerToken;
    getOrderSocket(getToken);
    return onParcelStatusUpdate(getToken, (payload) => {
      if (!payload?.parcelId || String(payload.parcelId) !== trackingId) return;
      if (payload.parcel) {
        setTrackingParcel(payload.parcel);
        return;
      }
      if (payload.status) {
        setTrackingParcel((prev) => (prev ? { ...prev, status: payload.status } : prev));
      }
    });
  }, [trackingId]);

  return (
    <div className="min-h-screen bg-slate-50 pb-8 font-sans">
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center gap-2">
        <button
          onClick={() => {
            if (trackingParcel) {
              setTrackingParcel(null);
              fetchHistory();
            } else {
              navigate('/profile');
            }
          }}
          className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1"
        >
          <ChevronLeft size={22} className="text-slate-800" />
        </button>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
          {trackingParcel ? 'Track Delivery' : 'Parcel History'}
        </h1>
      </div>

      <div className="container mx-auto max-w-4xl px-4 pb-6 font-outfit">
        {!trackingParcel && (
          <div className="space-y-4">
            <h2 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-2">
              <History className="text-primary" size={22} /> Delivery Requests
            </h2>

            {loading ? (
              <div className="bg-white rounded-3xl p-12 border border-slate-100 text-center">
                <p className="text-slate-500 text-sm font-medium">Loading parcel history…</p>
              </div>
            ) : history.length === 0 ? (
              <div className="bg-white rounded-3xl p-12 border border-slate-100 text-center space-y-3">
                <div className="h-16 w-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto">
                  <Package size={32} />
                </div>
                <p className="text-slate-800 font-bold text-lg">No parcel requests found</p>
                <p className="text-slate-400 text-sm max-w-sm mx-auto">
                  You haven&apos;t requested any parcel deliveries yet. Create your first request from Parcel Delivery.
                </p>
                <button
                  onClick={() => navigate('/parcel')}
                  className="px-6 py-2.5 bg-primary text-white font-bold text-sm rounded-xl hover:bg-primary-dark transition-all"
                >
                  Book a Delivery
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.map((parcel) => (
                  <div
                    key={parcel._id}
                    className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          ID: ...{parcel._id.slice(-6)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {parcel.deliverySpeed === 'express' ? (
                            <span className="text-[10px] font-extrabold px-2 py-1 rounded-full uppercase bg-amber-100 text-amber-800">
                              Express
                            </span>
                          ) : null}
                          <span
                            className={`text-xs font-extrabold px-3 py-1 rounded-full uppercase ${
                              parcel.status === 'DELIVERED'
                                ? 'bg-green-100 text-green-700'
                                : parcel.status === 'CANCELLED'
                                  ? 'bg-red-100 text-red-600'
                                  : parcel.status === 'SEARCHING'
                                    ? 'bg-amber-100 text-amber-700 animate-pulse'
                                    : 'bg-blue-100 text-blue-700 animate-pulse'
                            }`}
                          >
                            {formatParcelStatusLabel(parcel.status)}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <MapPin size={14} className="text-primary shrink-0 mt-0.5" />
                          <div className="text-xs text-slate-600 line-clamp-1">
                            <strong className="text-slate-800">From:</strong> {parcel.pickupAddress.fullAddress}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <MapPin size={14} className="text-red-500 shrink-0 mt-0.5" />
                          <div className="text-xs text-slate-600 line-clamp-1">
                            <strong className="text-slate-800">To:</strong>{' '}
                            {parcel.courierCompany
                              ? `${parcel.courierCompany}${parcel.destinationCity ? `, ${parcel.destinationCity}` : ''}`
                              : parcel.dropAddress?.fullAddress || '—'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold block uppercase">Fare</span>
                        <span className="text-base font-black text-slate-900">
                          ₹{Number(parcel.fare || 0).toFixed(2)}
                        </span>
                      </div>

                      <button
                        onClick={() => handleTrackParcel(parcel._id)}
                        className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 font-bold text-xs rounded-xl transition-all"
                      >
                        Track & Details
                      </button>
                    </div>

                    {parcel.status === 'DELIVERED' && (
                      <ParcelReviewPrompt parcelId={parcel._id} compact />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {trackingParcel && (
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-100 shadow-lg space-y-4 sm:space-y-6">
            <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 pb-3 sm:pb-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-lg font-black text-slate-800">Track Delivery Request</h2>
                <p className="text-[11px] sm:text-xs text-slate-400 font-bold uppercase tracking-wider mt-0.5 break-all">
                  ID: {trackingParcel._id}
                </p>
              </div>
              <span
                className={`text-[11px] sm:text-xs font-black px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full uppercase whitespace-nowrap ${
                  trackingParcel.status === 'DELIVERED'
                    ? 'bg-green-100 text-green-700'
                    : trackingParcel.status === 'CANCELLED'
                      ? 'bg-red-100 text-red-600'
                      : trackingParcel.status === 'SEARCHING'
                        ? 'bg-amber-100 text-amber-700 animate-pulse'
                        : 'bg-blue-100 text-blue-700'
                }`}
              >
                {formatParcelStatusLabel(trackingParcel.status)}
              </span>
            </div>

            {(trackingParcel.status === 'SEARCHING' || trackingParcel.status === 'REQUESTED') && (
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                <Clock className="text-amber-600 shrink-0 mt-0.5" size={18} />
                <div>
                  <p className="text-sm font-black text-amber-900">Finding a nearby rider</p>
                  <p className="text-xs text-amber-700 font-medium mt-1">
                    Available parcel delivery partners are being notified. The first rider to accept will be assigned to
                    your booking.
                  </p>
                </div>
              </div>
            )}

            <LiveTrackingMap
              pickupAddress={trackingParcel.pickupAddress}
              deliveryPartner={trackingParcel.deliveryPartnerId}
              status={trackingParcel.status}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 lg:gap-8">
              <div className="space-y-6">
                {['ACCEPTED', 'RIDER_ASSIGNED', 'PICKUP_REACHED'].includes(trackingParcel.status) &&
                  trackingParcel.otp && (
                  <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white flex justify-between items-center shadow-md">
                    <div>
                      <span className="text-[10px] font-black uppercase text-white/70 tracking-widest">
                        Pickup OTP
                      </span>
                      <p className="text-xs text-white/90 font-medium mt-1">
                        Share this OTP with the captain when they collect your parcel.
                      </p>
                    </div>
                    <div className="text-3xl font-black tracking-widest bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                      {trackingParcel.otp}
                    </div>
                  </div>
                )}

                {(trackingParcel.pickupSla?.canRequestLateRefund ||
                  ['requested', 'approved', 'rejected'].includes(
                    trackingParcel.lateRefundRequest?.status,
                  )) && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                      Late pickup (Normal 30 min)
                    </p>
                    {trackingParcel.lateRefundRequest?.status === 'requested' && (
                      <p className="text-xs text-amber-900 font-semibold">
                        Refund request pending admin review.
                      </p>
                    )}
                    {trackingParcel.lateRefundRequest?.status === 'approved' && (
                      <p className="text-xs text-emerald-800 font-semibold">
                        ₹{Number(trackingParcel.lateRefundRequest.approvedAmount || 0).toFixed(2)}{' '}
                        credited to wallet
                        {String(trackingParcel.paymentMethod).toUpperCase() === 'COD'
                          ? ' (full COD cash still collected)'
                          : ''}
                        .
                      </p>
                    )}
                    {trackingParcel.lateRefundRequest?.status === 'rejected' && (
                      <p className="text-xs text-slate-700 font-semibold">
                        Late refund request was rejected.
                      </p>
                    )}
                    {trackingParcel.pickupSla?.canRequestLateRefund && (
                      <>
                        <p className="text-xs text-amber-900 font-medium">
                          Captain took longer than 30 minutes. Request a wallet refund from admin.
                          {String(trackingParcel.paymentMethod).toUpperCase() === 'COD'
                            ? ' Full COD cash is still collected.'
                            : ''}
                        </p>
                        <button
                          type="button"
                          disabled={requestingLateRefund}
                          onClick={async () => {
                            setRequestingLateRefund(true);
                            try {
                              const res = await parcelApi.requestLateRefund(trackingParcel._id, {
                                reason: 'Normal pickup exceeded 30 minutes',
                              });
                              if (res.data?.success) {
                                toast.success('Late refund request sent');
                                const refreshed = await parcelApi.trackParcel(trackingParcel._id);
                                if (refreshed.data?.success) {
                                  setTrackingParcel(refreshed.data.result);
                                }
                              } else {
                                toast.error(res.data?.message || 'Request failed');
                              }
                            } catch (error) {
                              toast.error(error.response?.data?.message || 'Request failed');
                            } finally {
                              setRequestingLateRefund(false);
                            }
                          }}
                          className="w-full py-2.5 rounded-xl bg-amber-600 text-white text-xs font-black uppercase tracking-wider disabled:opacity-60"
                        >
                          {requestingLateRefund ? 'Submitting...' : 'Request late refund'}
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 space-y-4">
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                    Status History
                  </h3>
                  <div className="relative pl-5 sm:pl-6 space-y-5 sm:space-y-6 border-l-2 border-slate-200">
                    {[
                      { key: 'REQUESTED', label: 'Requested', desc: 'Booking requested by customer.' },
                      { key: 'SEARCHING', label: 'Searching for rider', desc: 'Notifying nearby parcel riders.' },
                      { key: 'ACCEPTED', label: 'Accepted', desc: 'Rider confirmed acceptance.' },
                      { key: 'RIDER_ASSIGNED', label: 'Rider Assigned', desc: 'Rider is on the way.' },
                      { key: 'PICKUP_REACHED', label: 'Rider Reached Pickup', desc: 'Rider reached the pickup point.' },
                      { key: 'PICKED_UP', label: 'Picked Up', desc: 'Captain collected your parcel. Tracking ended.' },
                    ].map((step) => {
                      // Customer timeline ends at pickup — hub drop / delivered are rider-only.
                      const statuses = [
                        'REQUESTED',
                        'SEARCHING',
                        'ACCEPTED',
                        'RIDER_ASSIGNED',
                        'PICKUP_REACHED',
                        'PICKED_UP',
                      ];
                      const displayStatus =
                        trackingParcel.status === 'OUT_FOR_DELIVERY' ||
                        trackingParcel.status === 'DELIVERED'
                          ? 'PICKED_UP'
                          : trackingParcel.status;
                      const currentIdx = statuses.indexOf(displayStatus);
                      const stepIdx = statuses.indexOf(step.key);
                      const isDone = stepIdx <= currentIdx && trackingParcel.status !== 'CANCELLED';
                      const isCurrent = stepIdx === currentIdx && trackingParcel.status !== 'CANCELLED';

                      return (
                        <div key={step.key} className="relative">
                          <div
                            className={`absolute -left-[27px] sm:-left-[31px] top-0.5 h-4 w-4 rounded-full border-2 bg-white flex items-center justify-center transition-all ${
                              isCurrent
                                ? 'border-primary ring-4 ring-primary/20 scale-110'
                                : isDone
                                  ? 'border-primary bg-primary'
                                  : 'border-slate-300'
                            }`}
                          >
                            {isDone && !isCurrent && <div className="h-1.5 w-1.5 bg-white rounded-full" />}
                          </div>
                          <div>
                            <h4
                              className={`text-[11px] sm:text-xs font-bold ${
                                isCurrent ? 'text-primary' : isDone ? 'text-slate-800' : 'text-slate-400'
                              }`}
                            >
                              {step.label}
                            </h4>
                            <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-4">{step.desc}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 space-y-4">
                  <h3 className="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wider">
                    Parcel Overview
                  </h3>

                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <MapPin className="text-primary shrink-0 mt-0.5" size={16} />
                      <div>
                        <strong className="text-xs text-slate-800 block">Pickup details:</strong>
                        <span className="text-xs text-slate-600">
                          {trackingParcel.pickupAddress.name} ({trackingParcel.pickupAddress.phone})
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">{trackingParcel.pickupAddress.fullAddress}</p>
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-slate-200/50 pt-3">
                      <Building2 className="text-red-500 shrink-0 mt-0.5" size={16} />
                      <div>
                        <strong className="text-xs text-slate-800 block">Dropoff details:</strong>
                        {trackingParcel.courierCompany && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            Courier: <span className="font-bold">{trackingParcel.courierCompany}</span>
                          </p>
                        )}
                        {trackingParcel.destinationCity && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            City: <span className="font-bold">{trackingParcel.destinationCity}</span>
                          </p>
                        )}
                        {trackingParcel.preferredPickupDate && (
                          <p className="text-xs text-slate-600 mt-0.5">
                            Booked for:{' '}
                            <span className="font-bold">
                              {trackingParcel.pickupWindow === 'today'
                                ? 'Today only'
                                : trackingParcel.pickupWindow === 'custom_days'
                                  ? `Booked for ${trackingParcel.pickupWindowDays || trackingParcel.fareBreakdown?.billableDays || ''} days`
                                : trackingParcel.pickupWindow === '7_days'
                                  ? 'Booked for 7 days'
                                  : trackingParcel.pickupWindow === '15_days'
                                    ? 'Booked for 15 days'
                                    : trackingParcel.pickupWindow === '30_days'
                                      ? 'Booked for 30 days'
                                      : trackingParcel.pickupWindow === 'specific'
                                        ? 'Till a date'
                                        : 'Scheduled'}
                              {' · '}
                              {trackingParcel.pickupWindow &&
                              !['specific', 'today'].includes(trackingParcel.pickupWindow)
                                ? `till ${new Date(trackingParcel.preferredPickupDate).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}`
                                : new Date(trackingParcel.preferredPickupDate).toLocaleDateString('en-IN', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                            </span>
                          </p>
                        )}
                        {!trackingParcel.courierCompany && !trackingParcel.destinationCity && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {trackingParcel.dropAddress?.fullAddress || '—'}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-slate-200/50 pt-3">
                      <Package className="text-slate-600 shrink-0 mt-0.5" size={16} />
                      <div>
                        <strong className="text-xs text-slate-800 block">Package details:</strong>
                        <span className="text-xs text-slate-600 uppercase font-bold">
                          {trackingParcel.packageDetails.packageType}
                        </span>
                        <p className="text-xs text-slate-500 mt-0.5">Weight: {trackingParcel.weight} KG</p>
                        {trackingParcel.packageDetails.description && (
                          <p className="text-xs text-slate-400 mt-0.5 italic">
                            &quot;{trackingParcel.packageDetails.description}&quot;
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {trackingParcel.deliveryPartnerId ? (
                  <div className="bg-white rounded-2xl p-5 border border-slate-200 flex items-center gap-4">
                    <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden">
                      {trackingParcel.deliveryPartnerId.profileImage ? (
                        <img
                          src={trackingParcel.deliveryPartnerId.profileImage}
                          alt="rider"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <User className="text-slate-500" size={24} />
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Assigned Rider
                      </span>
                      <h4 className="text-sm font-black text-slate-800 mt-0.5">
                        {trackingParcel.deliveryPartnerId.name}
                      </h4>
                      <p className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1">
                        <Phone size={12} /> {trackingParcel.deliveryPartnerId.phone}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 rounded-2xl p-5 border border-amber-200 text-center space-y-2">
                    <Clock className="text-amber-500 mx-auto animate-pulse" size={24} />
                    <h4 className="text-sm font-bold text-amber-800">Finding Delivery Partner</h4>
                    <p className="text-xs text-amber-600 max-w-xs mx-auto font-medium">
                      We&apos;ve notified delivery partners nearby. Once accepted, rider info will update here.
                    </p>
                  </div>
                )}

                {(trackingParcel.pickupProofImage || trackingParcel.deliveryProofImage) && (
                  <div className="bg-slate-50 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">Delivery Proofs</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {trackingParcel.pickupProofImage && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Pickup Photo</span>
                          <img
                            src={trackingParcel.pickupProofImage}
                            alt="Pickup Proof"
                            className="rounded-xl h-24 w-full object-cover border border-slate-200"
                          />
                        </div>
                      )}
                      {trackingParcel.deliveryProofImage && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">Delivery Photo</span>
                          <img
                            src={trackingParcel.deliveryProofImage}
                            alt="Delivery Proof"
                            className="rounded-xl h-24 w-full object-cover border border-slate-200"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {trackingParcel.status === 'DELIVERED' && (
                  <ParcelReviewPrompt parcelId={trackingParcel._id} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ParcelHistoryPage;
