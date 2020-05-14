from rest_framework.viewsets import ModelViewSet, ViewSet, ReadOnlyModelViewSet, GenericViewSet
from rest_framework.decorators import action
from rest_framework.response import Response

from .serializers import PreDeviceRoleSerializer, TopologyDummySerializer
from django.conf import settings

from utilities.api import IsAuthenticatedOrLoginNotRequired

from dcim.models import  DeviceRole, Device, Cable

ignore_cable_type_raw = settings.PLUGINS_CONFIG["netbox_topology_views"]["ignore_cable_type"]
ignore_cable_type = ignore_cable_type_raw.split(",")

preselected_device_roles_raw = settings.PLUGINS_CONFIG["netbox_topology_views"]["preselected_device_roles"]
preselected_device_roles = preselected_device_roles_raw.split(",")


class PreSelectDeviceRolesViewSet(ReadOnlyModelViewSet):
    queryset = DeviceRole.objects.filter(name__in=preselected_device_roles)
    serializer_class = PreDeviceRoleSerializer

class SaveCoordsViewSet(GenericViewSet):
    queryset = Device.objects.all()
    serializer_class = TopologyDummySerializer

    @action(detail=False, methods=['post'])
    def save_coords(self, request):
        if settings.PLUGINS_CONFIG["netbox_topology_views"]["allow_coordinates_saving"]:
            device_id = None
            x_coord = None
            y_coord = None
            if "node_id" in request.data:
                if request.data["node_id"]:
                    device_id = request.data["node_id"]
            if "x" in request.data:
                if request.data["x"]:
                    x_coord = request.data["x"]
            if "y" in request.data:
                if request.data["y"]:
                    y_coord = request.data["y"]

            actual_device= Device.objects.get(id=device_id)
            for device_custom_field in actual_device.custom_field_values.all():
                if device_custom_field.field.name == "coordinates":
                    old_cords =  device_custom_field.serialized_value.split(";")
                    device_custom_field.value = "%s;%s" % (x_coord,y_coord)
                    device_custom_field.save()
                    actual_device.save()
                    results = {}
                    results["status"] = "ok"
                    return Response(results)

            print('notok')
            #TODO
            return Response(status=500)
        else:
            return Response(status=500)

class SearchViewSet(GenericViewSet):
    #_ignore_model_permissions = True
    #permission_classes = [IsAuthenticatedOrLoginNotRequired]

    queryset = Device.objects.all()
    serializer_class = TopologyDummySerializer

    def _filter(self, site, role, name):
        filter_devices = Device.objects.all()
        if name is not None:
            filter_devices = filter_devices.filter(name__contains=name)
        if site is not None:
            filter_devices = filter_devices.filter(site__id__in=site)
        if role is not None:
            filter_devices = filter_devices.filter(device_role__id__in=role)
        return filter_devices


    @action(detail=False, methods=['post'])
    def search(self, request):
        name = None
        sites = None
        devicerole = None
        if "devicerole" in request.data:
            if request.data["devicerole"]:
                devicerole = request.data["devicerole"]
        if "sites" in request.data:
            if request.data["sites"]:
                sites = request.data["sites"]
        if "name" in request.data:
            if request.data["name"]:
                name = request.data["name"]

        devices = self._filter(sites, devicerole, name)

        nodes = []
        edges = []
        edge_ids = 0
        cable_ids = []
        for device in devices:
            cables = device.get_cables()
            for cable in cables:
                if cable.id not in cable_ids:
                    if cable.termination_a_type.name not in ignore_cable_type:
                        cable_ids.append(cable.id)
                        edge_ids += 1
                        edge = {}
                        edge["id"] = edge_ids
                        edge["from"] = cable.termination_a.device.id
                        edge["to"] = cable.termination_b.device.id
                        edge["title"] = "Connection between <br> " + cable.termination_a.device.name + " [" + cable.termination_a.name +  "]<br>" + cable.termination_b.device.name + " [" + cable.termination_b.name + "]"
                        edges.append(edge)
            node = {}
            node["id"] = device.id
            node["name"] = device.name
            node["label"] = device.name + " " + device.device_type.display_name
            node["shape"] = 'image'
            if device.device_role.slug in settings.PLUGINS_CONFIG["netbox_topology_views"]["device_img"]:
                node["image"] = '../../static/netbox_topology_views/img/'  + device.device_role.slug + ".png"
            else:
                node["image"] = "../../static/netbox_topology_views/img/role-unknown.png"

            for device_custom_field in device.custom_field_values.all():
                if device_custom_field.field.name == "coordinates":
                    cords =  device_custom_field.serialized_value.split(";")
                    node["x"] = int(cords[0])
                    node["y"] = int(cords[1])
                    node["physics"] = False
            
            nodes.append(node)

        results = {}
        results["nodes"] = nodes
        results["edges"] = edges

        return Response(results)
